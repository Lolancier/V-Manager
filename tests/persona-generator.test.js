import assert from "node:assert/strict";
import test from "node:test";
import { generatePersonaCardDraft, parseBingRss, parseDuckDuckGoHtml } from "../src-agent/persona-generator.js";
import { parseDsmlToolCalls } from "../src-agent/tool-call-parser.js";

test("DSML persona markup becomes an allowed structured tool call", () => {
  const markup = `<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="create_persona_card">
<｜｜DSML｜｜parameter name="name" string="true">守岸人</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="identity_name" string="true">守岸人</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="values" string="false">["守护","温柔"]</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>`;
  const calls = parseDsmlToolCalls(markup, ["create_persona_card"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, "create_persona_card");
  assert.deepEqual(JSON.parse(calls[0].function.arguments), {
    name: "守岸人",
    identity_name: "守岸人",
    values: ["守护", "温柔"]
  });
  assert.equal(parseDsmlToolCalls(markup, ["set_mood"]).length, 0);
});

test("Bing RSS parser retains source links and plain snippets", () => {
  const sources = parseBingRss(`<?xml version="1.0"?><rss><channel><item><title>守岸人 &amp; 黑海岸</title><link>https://example.com/shorekeeper</link><description><![CDATA[<b>角色资料</b> 与背景]]></description></item></channel></rss>`);
  assert.deepEqual(sources, [{ title: "守岸人 & 黑海岸", url: "https://example.com/shorekeeper", snippet: "角色资料 与背景" }]);
});

test("DuckDuckGo HTML parser unwraps result links", () => {
  const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fshorekeeper&amp;rut=x">守岸人 - 角色百科</a><a class="result__snippet">黑海岸的守护者</a>`;
  assert.deepEqual(parseDuckDuckGoHtml(html), [{ title: "守岸人 - 角色百科", url: "https://example.com/shorekeeper", snippet: "黑海岸的守护者" }]);
});

test("AI persona generation uses web references and returns a normalized draft", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("duckduckgo.com")) {
      return new Response(`<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fofficial">守岸人 - 官方角色介绍</a><a class="result__snippet">黑海岸的守护者</a>`, { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      name: "守岸人 · 鸣潮",
      payload: { identityName: "守岸人", identity: "黑海岸的守护者", speechStyle: "平静、温柔而克制", personalityTraits: ["温柔", "坚定"] }
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await generatePersonaCardDraft({ deepseek: { apiKey: "test-key", baseUrl: "https://api.example.com/v1", model: "model" } }, {
    description: "鸣潮守岸人",
    useWeb: true,
    requestedName: "守岸人"
  }, fetchImpl);
  assert.equal(requests.length, 2);
  assert.equal(result.sources[0].url, "https://example.com/official");
  assert.equal(result.draft.payload.identityName, "守岸人");
  assert.match(requests[1].options.body, /不可信的参考资料/);
});
