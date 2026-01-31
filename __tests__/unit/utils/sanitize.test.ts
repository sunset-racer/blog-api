import { describe, it, expect } from "vitest";
import {
    escapeHtml,
    stripHtml,
    sanitizeMarkdown,
    sanitizeText,
    sanitizeSlug,
    sanitizeEmail,
    sanitizeUrl,
    sanitizeFileName,
    hasSqlInjectionPatterns,
    sanitizeObject,
} from "../../../src/utils/sanitize";

describe("sanitize utilities", () => {
    describe("escapeHtml", () => {
        it("should escape ampersand", () => {
            expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
        });

        it("should escape less than and greater than", () => {
            expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
        });

        it("should escape quotes", () => {
            expect(escapeHtml('"test"')).toBe("&quot;test&quot;");
            expect(escapeHtml("'test'")).toBe("&#x27;test&#x27;");
        });

        it("should escape forward slash", () => {
            expect(escapeHtml("path/to/file")).toBe("path&#x2F;to&#x2F;file");
        });

        it("should escape backtick and equals", () => {
            expect(escapeHtml("`code`")).toBe("&#x60;code&#x60;");
            expect(escapeHtml("a=b")).toBe("a&#x3D;b");
        });

        it("should escape multiple dangerous characters together", () => {
            expect(escapeHtml('<script>alert("xss")</script>')).toBe(
                "&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;"
            );
        });

        it("should return empty string for empty input", () => {
            expect(escapeHtml("")).toBe("");
        });

        it("should not modify safe strings", () => {
            expect(escapeHtml("Hello World")).toBe("Hello World");
        });
    });

    describe("stripHtml", () => {
        it("should remove HTML tags", () => {
            expect(stripHtml("<p>Hello</p>")).toBe("Hello");
        });

        it("should remove self-closing tags", () => {
            expect(stripHtml("Hello<br/>World")).toBe("HelloWorld");
        });

        it("should remove tags with attributes", () => {
            expect(stripHtml('<a href="http://example.com">Link</a>')).toBe("Link");
        });

        it("should handle nested tags", () => {
            expect(stripHtml("<div><p>Nested</p></div>")).toBe("Nested");
        });

        it("should handle script tags", () => {
            expect(stripHtml("<script>alert('xss')</script>")).toBe("alert('xss')");
        });

        it("should return empty string for empty input", () => {
            expect(stripHtml("")).toBe("");
        });

        it("should preserve text without tags", () => {
            expect(stripHtml("Plain text")).toBe("Plain text");
        });
    });

    describe("sanitizeMarkdown", () => {
        it("should remove script tags with content", () => {
            expect(sanitizeMarkdown("<script>alert('xss')</script>")).toBe("");
        });

        it("should remove iframe tags", () => {
            expect(sanitizeMarkdown('<iframe src="evil.com"></iframe>')).toBe("");
        });

        it("should remove object tags", () => {
            expect(sanitizeMarkdown('<object data="malware.swf"></object>')).toBe("");
        });

        it("should remove embed tags", () => {
            expect(sanitizeMarkdown('<embed src="evil.swf">')).toBe("");
        });

        it("should remove form tags", () => {
            expect(sanitizeMarkdown('<form action="phishing.com"><input type="text"></form>')).toBe(
                ""
            );
        });

        it("should remove style tags", () => {
            expect(sanitizeMarkdown("<style>body { display: none; }</style>")).toBe("");
        });

        it("should remove link tags", () => {
            expect(sanitizeMarkdown('<link rel="stylesheet" href="evil.css">')).toBe("");
        });

        it("should remove meta tags", () => {
            expect(sanitizeMarkdown('<meta http-equiv="refresh" content="0;url=evil.com">')).toBe(
                ""
            );
        });

        it("should remove base tags", () => {
            expect(sanitizeMarkdown('<base href="evil.com">')).toBe("");
        });

        it("should remove button tags", () => {
            expect(sanitizeMarkdown("<button onclick=\"evil()\">Click</button>")).toBe("");
        });

        it("should remove select tags", () => {
            expect(sanitizeMarkdown("<select><option>Evil</option></select>")).toBe("");
        });

        it("should remove textarea tags", () => {
            expect(sanitizeMarkdown("<textarea>Evil content</textarea>")).toBe("");
        });

        it("should remove event handlers from remaining HTML", () => {
            expect(sanitizeMarkdown('<img src="cat.jpg" onerror="alert(1)">')).toBe(
                '<img src="cat.jpg">'
            );
        });

        it("should remove event handlers without quotes", () => {
            expect(sanitizeMarkdown("<div onmouseover=evil()>content</div>")).toBe(
                "<div>content</div>"
            );
        });

        it("should remove javascript: URLs", () => {
            expect(sanitizeMarkdown("javascript:alert(1)")).toBe("alert(1)");
        });

        it("should remove data:text/html URLs", () => {
            // Script tags are removed first, then data:text/html is removed
            expect(sanitizeMarkdown("data:text/html,<script>alert(1)</script>")).toBe(",");
        });

        it("should remove vbscript: URLs", () => {
            expect(sanitizeMarkdown("vbscript:msgbox(1)")).toBe("msgbox(1)");
        });

        it("should preserve safe markdown content", () => {
            const markdown = "# Heading\n\n**Bold** and *italic*\n\n- List item";
            expect(sanitizeMarkdown(markdown)).toBe(markdown);
        });

        it("should preserve safe HTML tags", () => {
            expect(sanitizeMarkdown("<p>Paragraph</p>")).toBe("<p>Paragraph</p>");
            expect(sanitizeMarkdown("<strong>Bold</strong>")).toBe("<strong>Bold</strong>");
        });
    });

    describe("sanitizeText", () => {
        it("should strip HTML and trim", () => {
            expect(sanitizeText("  <p>Hello World</p>  ")).toBe("Hello World");
        });

        it("should handle multiple tags", () => {
            expect(sanitizeText("<b>Bold</b> and <i>italic</i>")).toBe("Bold and italic");
        });

        it("should preserve plain text", () => {
            expect(sanitizeText("Plain text")).toBe("Plain text");
        });

        it("should trim whitespace", () => {
            expect(sanitizeText("  trimmed  ")).toBe("trimmed");
        });
    });

    describe("sanitizeSlug", () => {
        it("should lowercase the string", () => {
            expect(sanitizeSlug("Hello-World")).toBe("hello-world");
        });

        it("should trim whitespace", () => {
            expect(sanitizeSlug("  hello-world  ")).toBe("hello-world");
        });

        it("should replace non-alphanumeric characters with hyphens", () => {
            // Underscores and ! become hyphens, then trailing hyphen is removed
            expect(sanitizeSlug("hello_world!")).toBe("hello-world");
        });

        it("should collapse multiple hyphens", () => {
            expect(sanitizeSlug("hello---world")).toBe("hello-world");
        });

        it("should remove leading and trailing hyphens", () => {
            expect(sanitizeSlug("-hello-world-")).toBe("hello-world");
        });

        it("should handle spaces", () => {
            expect(sanitizeSlug("hello world")).toBe("hello-world");
        });

        it("should handle special characters", () => {
            expect(sanitizeSlug("Hello & World!")).toBe("hello-world");
        });

        it("should return empty string for empty input", () => {
            expect(sanitizeSlug("")).toBe("");
        });
    });

    describe("sanitizeEmail", () => {
        it("should lowercase the email", () => {
            expect(sanitizeEmail("Test@Example.COM")).toBe("test@example.com");
        });

        it("should trim whitespace", () => {
            expect(sanitizeEmail("  test@example.com  ")).toBe("test@example.com");
        });

        it("should handle already lowercase emails", () => {
            expect(sanitizeEmail("test@example.com")).toBe("test@example.com");
        });
    });

    describe("sanitizeUrl", () => {
        it("should return valid http URLs", () => {
            expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
        });

        it("should return valid https URLs", () => {
            expect(sanitizeUrl("https://example.com/path?query=1")).toBe(
                "https://example.com/path?query=1"
            );
        });

        it("should return null for invalid URLs", () => {
            expect(sanitizeUrl("not a url")).toBeNull();
        });

        it("should return null for javascript: URLs", () => {
            expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
        });

        it("should return null for data: URLs", () => {
            expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
        });

        it("should return null for ftp: URLs", () => {
            expect(sanitizeUrl("ftp://example.com")).toBeNull();
        });

        it("should return null for file: URLs", () => {
            expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
        });

        it("should handle URLs with ports", () => {
            expect(sanitizeUrl("https://example.com:8080/api")).toBe(
                "https://example.com:8080/api"
            );
        });

        it("should handle URLs with fragments", () => {
            expect(sanitizeUrl("https://example.com/page#section")).toBe(
                "https://example.com/page#section"
            );
        });
    });

    describe("sanitizeFileName", () => {
        it("should replace unsafe characters with underscores", () => {
            expect(sanitizeFileName("file name!@#.txt")).toBe("file_name___.txt");
        });

        it("should prevent path traversal", () => {
            expect(sanitizeFileName("../../../etc/passwd")).toBe("_._._etc_passwd");
        });

        it("should collapse multiple dots", () => {
            expect(sanitizeFileName("file..name.txt")).toBe("file.name.txt");
        });

        it("should remove leading dots", () => {
            expect(sanitizeFileName(".hidden")).toBe("hidden");
        });

        it("should limit length to 255 characters", () => {
            const longName = "a".repeat(300) + ".txt";
            expect(sanitizeFileName(longName).length).toBeLessThanOrEqual(255);
        });

        it("should allow alphanumeric, dots, and hyphens", () => {
            expect(sanitizeFileName("my-file.2024.txt")).toBe("my-file.2024.txt");
        });

        it("should handle empty string", () => {
            expect(sanitizeFileName("")).toBe("");
        });
    });

    describe("hasSqlInjectionPatterns", () => {
        it("should detect SELECT statements", () => {
            expect(hasSqlInjectionPatterns("SELECT * FROM users")).toBe(true);
        });

        it("should detect INSERT statements", () => {
            expect(hasSqlInjectionPatterns("INSERT INTO users")).toBe(true);
        });

        it("should detect UPDATE statements", () => {
            expect(hasSqlInjectionPatterns("UPDATE users SET")).toBe(true);
        });

        it("should detect DELETE statements", () => {
            expect(hasSqlInjectionPatterns("DELETE FROM users")).toBe(true);
        });

        it("should detect DROP statements", () => {
            expect(hasSqlInjectionPatterns("DROP TABLE users")).toBe(true);
        });

        it("should detect UNION SELECT", () => {
            expect(hasSqlInjectionPatterns("' UNION SELECT * FROM users--")).toBe(true);
        });

        it("should detect SQL comments", () => {
            expect(hasSqlInjectionPatterns("admin'--")).toBe(true);
            expect(hasSqlInjectionPatterns("admin'#")).toBe(true);
            expect(hasSqlInjectionPatterns("admin'/*")).toBe(true);
        });

        it("should detect OR-based injection", () => {
            expect(hasSqlInjectionPatterns("' OR 1=1")).toBe(true);
        });

        it("should detect AND-based injection", () => {
            expect(hasSqlInjectionPatterns("' AND 'a'='a")).toBe(true);
        });

        it("should detect chained statements", () => {
            expect(hasSqlInjectionPatterns("'; SELECT * FROM users")).toBe(true);
        });

        it("should return false for safe strings", () => {
            expect(hasSqlInjectionPatterns("Hello World")).toBe(false);
            expect(hasSqlInjectionPatterns("My blog post about SQL")).toBe(false);
        });

        it("should be case insensitive", () => {
            expect(hasSqlInjectionPatterns("select * from users")).toBe(true);
            expect(hasSqlInjectionPatterns("SeLeCt * FrOm users")).toBe(true);
        });
    });

    describe("sanitizeObject", () => {
        it("should trim string values", () => {
            const input = { name: "  John  ", email: "  test@example.com  " };
            const result = sanitizeObject(input);
            expect(result.name).toBe("John");
            expect(result.email).toBe("test@example.com");
        });

        it("should strip HTML when option is set", () => {
            const input = { content: "<p>Hello</p>" };
            const result = sanitizeObject(input, { stripHtml: true });
            expect(result.content).toBe("Hello");
        });

        it("should escape HTML when option is set", () => {
            const input = { content: "<script>alert(1)</script>" };
            const result = sanitizeObject(input, { escapeHtml: true });
            expect(result.content).toBe(
                "&lt;script&gt;alert(1)&lt;&#x2F;script&gt;"
            );
        });

        it("should apply both strip and escape HTML", () => {
            const input = { content: "<p>Hello & goodbye</p>" };
            const result = sanitizeObject(input, { stripHtml: true, escapeHtml: true });
            expect(result.content).toBe("Hello &amp; goodbye");
        });

        it("should recursively sanitize nested objects", () => {
            const input = {
                user: {
                    name: "  John  ",
                    profile: {
                        bio: "  <p>Bio</p>  ",
                    },
                },
            };
            const result = sanitizeObject(input, { stripHtml: true });
            expect(result.user.name).toBe("John");
            expect(result.user.profile.bio).toBe("Bio");
        });

        it("should preserve non-string values", () => {
            const input = { count: 42, active: true, items: ["a", "b"] };
            const result = sanitizeObject(input);
            expect(result.count).toBe(42);
            expect(result.active).toBe(true);
            expect(result.items).toEqual(["a", "b"]);
        });

        it("should handle empty objects", () => {
            const input = {};
            const result = sanitizeObject(input);
            expect(result).toEqual({});
        });

        it("should handle null values in object", () => {
            const input = { name: null as unknown as string, value: "test" };
            const result = sanitizeObject(input);
            expect(result.name).toBeNull();
            expect(result.value).toBe("test");
        });
    });
});
