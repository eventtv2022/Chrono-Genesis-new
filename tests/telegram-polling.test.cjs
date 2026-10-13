const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const requireApi = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { Telegraf } = requireApi("telegraf");

test("Telegraf polling and notification sending work through a local Telegram stub", async () => {
  let pollCount = 0;
  let receivedMessage;
  let signalPollingStarted;
  const pollingStarted = new Promise((resolve) => {
    signalPollingStarted = resolve;
  });

  const server = http.createServer((req, res) => {
    const method = req.url.split("/").at(-1);
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (method === "getMe") {
        res.end(JSON.stringify({
          ok: true,
          result: { id: 1, is_bot: true, first_name: "Local Test", username: "local_test_bot" },
        }));
        return;
      }
      if (method === "deleteWebhook") {
        res.end(JSON.stringify({ ok: true, result: true }));
        return;
      }
      if (method === "getUpdates") {
        pollCount += 1;
        if (pollCount === 1) {
          signalPollingStarted();
          // Keep the long-poll request open until bot.stop() aborts it.
          return;
        }
        res.end(JSON.stringify({ ok: true, result: [] }));
        return;
      }
      if (method === "sendMessage") {
        receivedMessage = JSON.parse(body);
        res.end(JSON.stringify({
          ok: true,
          result: {
            message_id: 1,
            date: 0,
            chat: { id: receivedMessage.chat_id, type: "private" },
            text: receivedMessage.text,
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, description: "Unexpected test API method" }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const bot = new Telegraf("123456:local-test-token", {
    telegram: { apiRoot: `http://127.0.0.1:${address.port}` },
  });

  try {
    const launch = bot.launch();
    await Promise.race([
      pollingStarted,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Telegraf did not start polling")), 3000),
      ),
    ]);

    const sent = await bot.telegram.sendMessage(42, "Safe local test notification");
    assert.equal(sent.text, "Safe local test notification");
    assert.equal(receivedMessage.chat_id, 42);
    assert.equal(receivedMessage.text, "Safe local test notification");

    bot.stop();
    await launch;
    assert.ok(pollCount >= 1);
  } finally {
    if (bot.polling) bot.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});
