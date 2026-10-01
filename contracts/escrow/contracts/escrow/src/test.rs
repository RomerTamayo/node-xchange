#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

struct Setup<'a> {
    env: Env,
    escrow: EscrowClient<'a>,
    token: TokenClient<'a>,
    buyer: Address,
    seller: Address,
    arbiter: Address,
    fee_to: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac.address();

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let fee_to = Address::generate(&env);
    StellarAssetClient::new(&env, &token_id).mint(&buyer, &10_000);

    // 0.5% operator fee
    let escrow_id = env.register(Escrow, (fee_to.clone(), 50u32));
    let escrow = EscrowClient::new(&env, &escrow_id);
    let token = TokenClient::new(&env, &token_id);

    Setup { env, escrow, token, buyer, seller, arbiter, fee_to }
}

fn create_deal(s: &Setup, amount: i128) -> u64 {
    s.escrow.create(
        &s.buyer,
        &s.seller,
        &s.arbiter,
        &s.token.address,
        &amount,
        &2_000,
    )
}

#[test]
fn release_pays_seller_minus_fee() {
    let s = setup();
    let id = create_deal(&s, 10_000);
    assert_eq!(s.token.balance(&s.escrow.address), 10_000);

    s.escrow.release(&id);

    assert_eq!(s.token.balance(&s.seller), 9_950);
    assert_eq!(s.token.balance(&s.fee_to), 50);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
    assert_eq!(s.escrow.get_deal(&id).status, Status::Released);
}

#[test]
fn cancel_refunds_buyer_without_fee() {
    let s = setup();
    let id = create_deal(&s, 10_000);
    s.escrow.cancel(&id);

    assert_eq!(s.token.balance(&s.buyer), 10_000);
    assert_eq!(s.token.balance(&s.fee_to), 0);
    assert_eq!(s.escrow.get_deal(&id).status, Status::Refunded);
}

#[test]
fn arbiter_resolves_both_ways() {
    let s = setup();
    let a = create_deal(&s, 4_000);
    let b = create_deal(&s, 6_000);

    s.escrow.resolve(&a, &true);
    s.escrow.resolve(&b, &false);

    assert_eq!(s.token.balance(&s.seller), 3_980);
    assert_eq!(s.token.balance(&s.fee_to), 20);
    assert_eq!(s.token.balance(&s.buyer), 6_000);
}

#[test]
fn reclaim_only_after_deadline() {
    let s = setup();
    let id = create_deal(&s, 1_000);

    assert_eq!(s.escrow.try_reclaim(&id), Err(Ok(Error::DeadlineNotReached)));

    s.env.ledger().set_timestamp(2_000);
    s.escrow.reclaim(&id);
    assert_eq!(s.token.balance(&s.buyer), 10_000);
}

#[test]
fn settled_deal_cannot_be_settled_again() {
    let s = setup();
    let id = create_deal(&s, 1_000);
    s.escrow.release(&id);

    assert_eq!(s.escrow.try_release(&id), Err(Ok(Error::NotFunded)));
    assert_eq!(s.escrow.try_cancel(&id), Err(Ok(Error::NotFunded)));
}

#[test]
fn rejects_invalid_deals() {
    let s = setup();
    let t = &s.token.address;
    assert_eq!(
        s.escrow.try_create(&s.buyer, &s.seller, &s.arbiter, t, &0, &2_000),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.escrow.try_create(&s.buyer, &s.seller, &s.arbiter, t, &10, &500),
        Err(Ok(Error::InvalidDeadline))
    );
    assert_eq!(
        s.escrow.try_create(&s.buyer, &s.buyer, &s.arbiter, t, &10, &2_000),
        Err(Ok(Error::SameParty))
    );
}

#[test]
fn release_requires_buyer_auth() {
    let s = setup();
    let id = create_deal(&s, 1_000);
    s.escrow.release(&id);

    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.buyer);
}

#[test]
fn deals_are_indexed_for_both_parties() {
    let s = setup();
    let a = create_deal(&s, 1_000);
    let b = create_deal(&s, 2_000);
    let stranger = Address::generate(&s.env);

    assert_eq!(s.escrow.deals_of(&s.buyer), soroban_sdk::vec![&s.env, a, b]);
    assert_eq!(s.escrow.deals_of(&s.seller), soroban_sdk::vec![&s.env, a, b]);
    assert_eq!(s.escrow.deals_of(&stranger).len(), 0);

    // Settling keeps the deal listed, with its final status.
    s.escrow.release(&a);
    assert_eq!(s.escrow.deals_of(&s.buyer).len(), 2);
    assert_eq!(s.escrow.get_deal(&a).status, Status::Released);
}
