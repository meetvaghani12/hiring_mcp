import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown, safeUrl } from "../src/web/views.js";

describe("escapeHtml", () => {
  it("neutralizes all html-special characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>'&`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;",
    );
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("safeUrl", () => {
  it("passes http(s) and blocks everything else", () => {
    expect(safeUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>")).toBeNull();
    expect(safeUrl("  https://example.com")).toBeNull(); // leading space = not a clean URL
    expect(safeUrl(null)).toBeNull();
  });
});

describe("renderMarkdown", () => {
  it("escapes raw html before formatting", () => {
    const html = renderMarkdown("# Hi\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("renders headings, lists, bold, and only http(s) links", () => {
    const html = renderMarkdown("## Skills\n- **Go**\n- [site](https://example.com)\n- [bad](javascript:alert(1))");
    expect(html).toContain("<h3>Skills</h3>");
    expect(html).toContain("<strong>Go</strong>");
    expect(html).toContain('<a href="https://example.com"');
    expect(html).not.toContain('href="javascript:');
  });
});
