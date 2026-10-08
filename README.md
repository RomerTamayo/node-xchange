<p align="center">
  <img src="apps/web/public/logoNodeXchange.png" alt="NodeXchange" width="120" />
</p>

<h1 align="center">NodeXchange</h1>

<p align="center">
  Chatea y paga de billetera a billetera, sobre Stellar.<br />
  <a href="https://nodexchange.pages.dev"><b>Probar la demo</b></a> · testnet
</p>

---

## ¿Qué es?

NodeXchange es un chat entre billeteras Stellar con pagos integrados. Hablas con la otra persona y, en la misma conversación, le pagas, sin pasar a otra app ni copiar direcciones de un lado a otro.

Pensado para compras y ventas entre personas: marketplaces, grupos de venta, ferias o cualquier trato en el que primero se conversa y luego se paga.

## ¿Qué puedes hacer?

- **Chatear con cifrado de extremo a extremo.** Solo tú y la otra persona pueden leer los mensajes. El servidor solo guarda texto cifrado y lo borra 48 horas después de leído.
- **Pago directo.** Envías XLM o USDC y llega al instante.
- **Pago protegido.** El dinero queda en garantía en un contrato inteligente (Soroban) y se libera al vendedor cuando confirmas que recibiste lo acordado. Si no llega, se puede reclamar la devolución.
- **Direcciones externas.** Si confías en la otra persona, puedes pagarle a su Binance u otra billetera (por ahora red BEP20). La app te avisa claramente que ese pago no tiene garantía.
- **Contactos con QR.** Muestra tu código QR o comparte tu enlace para que te agreguen en persona o por WhatsApp. Tus contactos se guardan cifrados en tu dispositivo.
- **Usa tu billetera de siempre.** Freighter, xBull, Lobstr, Albedo y otras, o una billetera creada en el navegador.

## Cómo se usa

1. Entra a **[nodexchange.pages.dev](https://nodexchange.pages.dev)**.
2. Conecta tu billetera (por ejemplo Freighter en **Testnet**) o crea una nueva.
3. Escanea el QR de alguien o pega su dirección `G…` para abrir un chat.
4. Escribe y, cuando lleguen a un acuerdo, pulsa **Pagar**: directo, protegido o externo.

> Es una demo en **testnet**: el dinero es de prueba. En la billetera tienes un botón para fondear tu cuenta gratis.

## ¿Por qué NodeXchange?

- **Todo en un solo lugar:** la conversación y el pago quedan juntos, con el comprobante en el chat.
- **Más seguro para comprar a desconocidos:** el pago protegido evita entregar el dinero antes de recibir el producto.
- **Privado:** mensajes cifrados, sin cuentas de correo ni número de teléfono; tu identidad es tu billetera.
- **Abierto:** cualquiera puede montar su propio nodo; el código es libre (AGPL-3.0).

## Cómo está hecho (resumen)

| Parte | Tecnología | Carpeta |
| --- | --- | --- |
| App web | React, Vite, TypeScript, Tailwind | `apps/web` |
| Protocolo y cliente | TypeScript (cifrado con tweetnacl, firmas SEP-53) | `packages/core` |
| Nodo de mensajes | Supabase (Postgres + Edge Function) | `supabase` |
| Garantía de pagos | Contrato Soroban en Rust | `contracts/escrow` |

El nodo de la carpeta `supabase` es el **nodo de referencia**: funciona completo y cualquiera puede montarlo, pero solo recibe arreglos de seguridad. El nodo oficial usa una versión ampliada, compatible con el mismo protocolo.

## Ejecutarlo en tu equipo

Necesitas Node.js, pnpm, Docker y el CLI de Supabase.

```sh
pnpm install
supabase start                 # base de datos local
supabase functions serve nx    # nodo de mensajes (déjalo corriendo)
cp apps/web/.env.example apps/web/.env
pnpm dev:web                   # http://localhost:5173
```

Pruebas: `pnpm --filter @nodexchange/core test`.

## Licencia

El código está bajo la licencia [AGPL-3.0](LICENSE). El nombre y el logo de NodeXchange no están incluidos en esa licencia; mira la [política de marca](TRADEMARK.md). Para contribuir, lee [CONTRIBUTING.md](CONTRIBUTING.md).

---

**English:** NodeXchange is an end-to-end encrypted chat between Stellar wallets with built-in payments: direct XLM/USDC transfers, escrow-protected deals on a Soroban contract, optional unprotected payments to external addresses, and QR contacts. [Try the testnet demo](https://nodexchange.pages.dev).
