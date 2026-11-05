import test from "node:test";
import assert from "node:assert/strict";
import { createAiServer, validateChatRequest, validateModelOutput } from "./ai-service.mjs";

function makeCandles(count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const time = 1_700_000_000 + index * 60;
    return { time, open: 100 + index, high: 103 + index, low: 99 + index, close: 102 + index, volume: 10 };
  });
}

const goodRequest = () => ({
  symbol: "BTCUSD",
  timeframe: "1m",
  candles: makeCandles(),
  messages: [{ role: "user", content: "Explain the recent movement." }],
});

async function withServer(options, run) {
  const server = createAiServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function providerResponse(payload) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("accepts a valid bounded chart question", () => {
  const result = validateChatRequest(goodRequest());
  assert.equal(result.error, undefined);
  assert.equal(result.value.candles.length, 6);
  assert.equal(result.value.messages[0].role, "user");
});

test("rejects unsupported timeframes and unsorted candle times", () => {
  const badTimeframe = goodRequest();
  badTimeframe.timeframe = "2m";
  assert.match(validateChatRequest(badTimeframe).error, /timeframe/i);

  const badTimes = goodRequest();
  badTimes.candles[2].time = badTimes.candles[1].time;
  assert.match(validateChatRequest(badTimes).error, /ascending/i);
});

test("rejects chat payloads outside message and candle limits", () => {
  const tooManyCandles = goodRequest();
  tooManyCandles.candles = makeCandles(121);
  assert.match(validateChatRequest(tooManyCandles).error, /between 5 and 120/i);

  const longMessage = goodRequest();
  longMessage.messages[0].content = "x".repeat(1_201);
  assert.match(validateChatRequest(longMessage).error, /length limit/i);
});

test("keeps only chart points tied to real candle timestamps and in-range prices", () => {
  const candles = makeCandles();
  const result = validateModelOutput({
    reply: "I see a rising sequence, with uncertainty because the view is short.",
    points: [
      { time: candles[2].time, price: 104, kind: "bullish", label: "Higher low", explanation: "A pullback held above the previous candle low." },
      { time: candles[2].time + 30, price: 104, kind: "bullish", label: "Invented time", explanation: "Not a supplied candle." },
      { time: candles[3].time, price: 999, kind: "level", label: "Out of range", explanation: "Price is outside the chart snapshot." },
      { time: candles[4].time, price: 105, kind: "buy", label: "Invalid type", explanation: "Unknown marker kind." },
    ],
  }, candles);

  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].label, "Higher low");
});

test("accepts at most one potential swing high and low at chart-supported levels", () => {
  const candles = makeCandles();
  const latest = candles.at(-1);
  const result = validateModelOutput({
    reply: "A possible high is near prior resistance; it remains uncertain until price rejects there.",
    points: [
      { time: latest.time, price: 108, kind: "potential-swing-high", label: "High idea", explanation: "Prior high may reject; a close above it invalidates this idea." },
      { time: latest.time, price: 100, kind: "potential-swing-low", label: "Low idea", explanation: "A prior reaction area may hold; acceptance below it invalidates the idea." },
      { time: latest.time, price: 108, kind: "potential-swing-high", label: "Duplicate high", explanation: "Only one high candidate is allowed." },
      { time: candles[2].time, price: 108, kind: "potential-swing-high", label: "Wrong time", explanation: "Candidates must attach to the newest bar." },
      { time: latest.time, price: 109, kind: "potential-swing-high", label: "Outside chart", explanation: "Candidate is beyond the observed range." },
    ],
  }, candles);

  const wrongSide = validateModelOutput({
    reply: "A high candidate must be above the current close.",
    points: [
      { time: latest.time, price: 100, kind: "potential-swing-high", label: "Wrong side", explanation: "A high candidate must be above the latest close." },
    ],
  }, candles);

  assert.deepEqual(result.points.map((point) => [point.kind, point.time, point.price, point.label]), [
    ["potential-swing-high", latest.time, 108, "Potential swing high"],
    ["potential-swing-low", latest.time, 100, "Potential swing low"],
  ]);
  assert.equal(wrongSide.points.length, 0);
});

test("rejects malformed provider output", () => {
  assert.throws(() => validateModelOutput({ reply: "", points: [] }, makeCandles()));
  assert.throws(() => validateModelOutput({ reply: "valid", points: Array(6).fill({}) }, makeCandles()));
});

test("reports an unconfigured server without exposing any credential material", async () => {
  await withServer({ env: {}, logger: { error() {} } }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/ai/health`).then((response) => response.json());
    assert.deepEqual(health, { ok: true, configured: false });

    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OPENAI_API_KEY/);
  });
});

test("allows unauthenticated AI chat only in loopback local mode", async () => {
  let providerAuthorization;
  await withServer({
    env: { AI_LOCAL_DEV: "true", OPENAI_API_KEY: "local-secret", OPENAI_MODEL: "test-model" },
    logger: { error() {} },
    fetchImpl: async (_url, options) => {
      providerAuthorization = options.headers.Authorization;
      return providerResponse({ reply: "The chart has a confirmed swing high.", points: [] });
    },
  }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/ai/health`).then((response) => response.json());
    assert.deepEqual(health, { ok: true, configured: true });

    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, "The chart has a confirmed swing high.");
    assert.equal(providerAuthorization, "Bearer local-secret");
  });
});

test("requires a signed-in app session before the provider can be called", async () => {
  let providerCalled = false;
  const authUrl = "https://auth.example/api/auth/preferences";
  await withServer({
    env: { OPENAI_API_KEY: "server-secret", OPENAI_MODEL: "test-model", AUTH_INTROSPECTION_URL: authUrl },
    logger: { error() {} },
    fetchImpl: async (url) => {
      if (url === authUrl) return new Response("unauthorized", { status: 401 });
      providerCalled = true;
      return providerResponse({ reply: "Unexpected.", points: [] });
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer invalid-session" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal(response.status, 401);
    assert.equal(providerCalled, false);
  });
});

test("keeps provider authorization server-side and returns only validated annotations", async () => {
  let providerRequest;
  const candles = makeCandles();
  const authUrl = "https://auth.example/api/auth/preferences";
  await withServer({
    env: { OPENAI_API_KEY: "server-secret", OPENAI_MODEL: "test-model", AUTH_INTROSPECTION_URL: authUrl, AI_ALLOWED_ORIGINS: "https://chart.example" },
    logger: { error() {} },
    fetchImpl: async (url, options) => {
      if (url === authUrl) return new Response("{}", { status: 200 });
      providerRequest = options;
      return providerResponse({
        reply: "A short rising sequence is visible; a larger context would help.",
        points: [
          { time: candles[2].time, price: 104, kind: "level", label: "Observed level", explanation: "A supplied candle price." },
          { time: candles[2].time + 30, price: 104, kind: "bullish", label: "Invented time", explanation: "Should be removed." },
          { time: candles[2].time, price: 100, kind: "level", label: "Wrong candle price", explanation: "Inside overall range but not this candle." },
        ],
      });
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://chart.example", Authorization: "Bearer verified-session" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].label, "Observed level");
    assert.equal(providerRequest.headers.Authorization, "Bearer server-secret");
    assert.doesNotMatch(JSON.stringify(providerRequest), /verified-session/);
    assert.doesNotMatch(JSON.stringify(result), /server-secret/);

    const blocked = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://not-allowed.example" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal(blocked.status, 403);
  });
});

test("enforces the configured per-process UTC-day cap", async () => {
  await withServer({
    env: {
      OPENAI_API_KEY: "server-secret",
      OPENAI_MODEL: "test-model",
      AUTH_INTROSPECTION_URL: "https://auth.example/api/auth/preferences",
      AI_MAX_REQUESTS_PER_DAY: "1",
    },
    logger: { error() {} },
    fetchImpl: async (url) => url === "https://auth.example/api/auth/preferences"
      ? new Response("{}", { status: 200 })
      : providerResponse({ reply: "Observed.", points: [] }),
  }, async (baseUrl) => {
    const post = () => fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer verified-session" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal((await post()).status, 200);
    const limited = await post();
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /daily request limit/i);
  });
});

test("enforces the configured per-session UTC-day cap", async () => {
  const authUrl = "https://auth.example/api/auth/preferences";
  await withServer({
    env: {
      OPENAI_API_KEY: "server-secret",
      OPENAI_MODEL: "test-model",
      AUTH_INTROSPECTION_URL: authUrl,
      AI_MAX_REQUESTS_PER_USER_PER_DAY: "1",
      AI_MAX_REQUESTS_PER_DAY: "10",
    },
    logger: { error() {} },
    fetchImpl: async (url) => url === authUrl
      ? new Response("{}", { status: 200 })
      : providerResponse({ reply: "Observed.", points: [] }),
  }, async (baseUrl) => {
    const post = () => fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer same-session" },
      body: JSON.stringify(goodRequest()),
    });
    assert.equal((await post()).status, 200);
    const limited = await post();
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /AI analysis daily limit/i);
  });
});
