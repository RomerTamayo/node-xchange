#![no_std]
//! NodeXchange escrow: holds a buyer's payment until the deal is completed.
//!
//! Flow: the buyer funds a deal -> the buyer releases it (seller is paid minus
//! the operator fee), the seller cancels it (buyer refunded), the arbiter
//! resolves a dispute, or the buyer reclaims it after the deadline.
//! The operator fee is only charged when the seller gets paid.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, Env, Vec,
};

const MAX_FEE_BPS: u32 = 1_000; // 10%
const BPS_DENOMINATOR: i128 = 10_000;

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const DEAL_BUMP: u32 = 60 * DAY_IN_LEDGERS;
const DEAL_THRESHOLD: u32 = DEAL_BUMP - DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    FeeTo,
    FeeBps,
    NextId,
    Deal(u64),
    /// Ids of the deals a user takes part in, so any device can find them.
    UserDeals(Address),
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Funded,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub arbiter: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: Status,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidFee = 1,
    InvalidAmount = 2,
    InvalidDeadline = 3,
    SameParty = 4,
    DealNotFound = 5,
    NotFunded = 6,
    DeadlineNotReached = 7,
}

#[contractevent]
pub struct DealCreated {
    #[topic]
    pub id: u64,
    #[topic]
    pub buyer: Address,
    #[topic]
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
}

#[contractevent]
pub struct DealReleased {
    #[topic]
    pub id: u64,
    pub to_seller: i128,
    pub fee: i128,
}

#[contractevent]
pub struct DealRefunded {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// `fee_to` receives `fee_bps` (1 bps = 0.01%) of every released deal.
    pub fn __constructor(env: Env, fee_to: Address, fee_bps: u32) -> Result<(), Error> {
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::InvalidFee);
        }
        let storage = env.storage().instance();
        storage.set(&DataKey::FeeTo, &fee_to);
        storage.set(&DataKey::FeeBps, &fee_bps);
        storage.set(&DataKey::NextId, &0u64);
        Ok(())
    }

    /// Buyer locks `amount` of `token` for `seller`. Returns the deal id.
    pub fn create(
        env: Env,
        buyer: Address,
        seller: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        deadline: u64,
    ) -> Result<u64, Error> {
        buyer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }
        if buyer == seller {
            return Err(Error::SameParty);
        }

        TokenClient::new(&env, &token).transfer(&buyer, &env.current_contract_address(), &amount);

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);

        let deal = Deal {
            buyer: buyer.clone(),
            seller: seller.clone(),
            arbiter,
            token: token.clone(),
            amount,
            deadline,
            status: Status::Funded,
        };
        save_deal(&env, id, &deal);
        index_deal(&env, &buyer, id);
        index_deal(&env, &seller, id);

        DealCreated { id, buyer, seller, token, amount }.publish(&env);
        Ok(id)
    }

    /// Buyer confirms the deal is done: seller is paid, operator takes the fee.
    pub fn release(env: Env, id: u64) -> Result<(), Error> {
        let deal = funded_deal(&env, id)?;
        deal.buyer.require_auth();
        pay_seller(&env, id, deal)
    }

    /// Seller backs out: the buyer gets everything back.
    pub fn cancel(env: Env, id: u64) -> Result<(), Error> {
        let deal = funded_deal(&env, id)?;
        deal.seller.require_auth();
        refund_buyer(&env, id, deal)
    }

    /// Arbiter settles a dispute in favour of the seller or the buyer.
    pub fn resolve(env: Env, id: u64, to_seller: bool) -> Result<(), Error> {
        let deal = funded_deal(&env, id)?;
        deal.arbiter.require_auth();
        if to_seller {
            pay_seller(&env, id, deal)
        } else {
            refund_buyer(&env, id, deal)
        }
    }

    /// Buyer takes the funds back once the deadline has passed unresolved.
    pub fn reclaim(env: Env, id: u64) -> Result<(), Error> {
        let deal = funded_deal(&env, id)?;
        deal.buyer.require_auth();
        if env.ledger().timestamp() < deal.deadline {
            return Err(Error::DeadlineNotReached);
        }
        refund_buyer(&env, id, deal)
    }

    pub fn get_deal(env: Env, id: u64) -> Result<Deal, Error> {
        load_deal(&env, id)
    }

    /// Deal ids where `user` is the buyer or the seller, oldest first.
    pub fn deals_of(env: Env, user: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::UserDeals(user))
            .unwrap_or(Vec::new(&env))
    }

    pub fn fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
    }
}

fn load_deal(env: &Env, id: u64) -> Result<Deal, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Deal(id))
        .ok_or(Error::DealNotFound)
}

fn funded_deal(env: &Env, id: u64) -> Result<Deal, Error> {
    let deal = load_deal(env, id)?;
    if deal.status != Status::Funded {
        return Err(Error::NotFunded);
    }
    Ok(deal)
}

fn save_deal(env: &Env, id: u64, deal: &Deal) {
    let key = DataKey::Deal(id);
    env.storage().persistent().set(&key, deal);
    env.storage()
        .persistent()
        .extend_ttl(&key, DEAL_THRESHOLD, DEAL_BUMP);
}

fn index_deal(env: &Env, user: &Address, id: u64) {
    let key = DataKey::UserDeals(user.clone());
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    ids.push_back(id);
    env.storage().persistent().set(&key, &ids);
    env.storage()
        .persistent()
        .extend_ttl(&key, DEAL_THRESHOLD, DEAL_BUMP);
}

fn pay_seller(env: &Env, id: u64, mut deal: Deal) -> Result<(), Error> {
    // Mark settled before moving funds.
    deal.status = Status::Released;
    save_deal(env, id, &deal);

    let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
    let fee = deal.amount * fee_bps as i128 / BPS_DENOMINATOR;
    let to_seller = deal.amount - fee;

    let token = TokenClient::new(env, &deal.token);
    let this = env.current_contract_address();
    token.transfer(&this, &deal.seller, &to_seller);
    if fee > 0 {
        let fee_to: Address = env.storage().instance().get(&DataKey::FeeTo).unwrap();
        token.transfer(&this, &fee_to, &fee);
    }

    DealReleased { id, to_seller, fee }.publish(env);
    Ok(())
}

fn refund_buyer(env: &Env, id: u64, mut deal: Deal) -> Result<(), Error> {
    deal.status = Status::Refunded;
    save_deal(env, id, &deal);

    TokenClient::new(env, &deal.token).transfer(
        &env.current_contract_address(),
        &deal.buyer,
        &deal.amount,
    );

    DealRefunded { id, amount: deal.amount }.publish(env);
    Ok(())
}

mod test;
