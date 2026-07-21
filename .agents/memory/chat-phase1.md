---
name: P2P Chat Phase 1
description: E2EE DM мессенджер — tweetnacl box, WS-relay, таблица dm_messages, chat_public_key в citizens.
---

## Реализация

**DB**: Таблица `dm_messages` (id, from_citizen_id, to_citizen_id, ciphertext, nonce, msg_type, darmin_amount, created_at, read_at). Поле `chat_public_key TEXT` добавлено в `citizens`. Схема применена через прямой SQL (Drizzle push не работает без TTY).

**API роут**: `artifacts/api-server/src/routes/chat.ts` — 6 эндпоинтов под `/chat/*`: POST key, GET key/:id, GET conversations, GET messages/:withId, POST messages, PATCH messages/read/:withId. Auth: Bearer токен через `citizensTable.authToken`.

**E2EE**: `artifacts/mobile/lib/e2ee.ts` — tweetnacl box (Curve25519 + XSalsa20). Keypair хранится в AsyncStorage `@timenation/chat_keypair`. Публичный ключ загружается на сервер при первом открытии чата. Сервер хранит только base64 ciphertext + nonce.

**Mobile экраны**: `app/chat.tsx` (список переписок) + `app/chat/[citizenId].tsx` (разговор). Не вкладка — доступ через кнопку в header TiMETR (иконка message-square).

**WS relay**: При POST /chat/messages сервер вызывает `pushToCitizen(toCitizenId, { type: "chat_message", message })`. Mobile слушает WS с аутентификацией `{ type: "auth", citizenId }`.

**Darmin transfer**: Кнопка "Д" в инпут-баре → модалка → POST /api/transactions + POST /api/chat/messages с msgType="darmin_transfer".

## Важные нюансы

- tweetnacl-util: `encodeUTF8(bytes→string)`, `decodeUTF8(string→bytes)` — названия контринтуитивны.
- `/api/citizens` возвращает массив напрямую (не `{ citizens: [...] }`), поиск — клиентский фильтр.
- Drizzle push требует TTY — применять схему через прямой SQL: `node -e "require('/path/to/pg').Pool..."`.
- `CitizenContext` не экспортирует `CitizenContext` напрямую — использовать `useCitizen()` хук.
