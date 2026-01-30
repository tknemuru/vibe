import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";

/** テンプレートディレクトリのルートパス */
const TEMPLATES_DIR = join(__dirname, "../../templates");

/** プロンプトディレクトリのパス */
const PROMPTS_DIR = join(TEMPLATES_DIR, "prompts");

/** ルーティングディレクトリのパス */
const ROUTING_DIR = join(TEMPLATES_DIR, "routing");

/**
 * 規約で許可された差し込み変数名の一覧
 */
const ALLOWED_VARIABLES = [
  "book.title",
  "book.authors",
  "book.publisher",
  "book.published_date",
  "book.description",
];

/**
 * YAML ファイルを読み込みパースする
 */
function loadYaml(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  return yaml.load(content) as Record<string, unknown>;
}

/**
 * 指定ディレクトリ内の全 .md ファイルパスを取得する
 */
function getMarkdownFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(dir, f));
}

describe("routing_rules.yaml", () => {
  const rules = loadYaml(join(ROUTING_DIR, "routing_rules.yaml"));

  it("必須キーが存在すること（llm.default_model, output_routing.by_confidence, auto_triggers）", () => {
    const llm = rules.llm as Record<string, unknown>;
    expect(llm).toBeDefined();
    expect(llm.default_model).toBeDefined();

    const outputRouting = rules.output_routing as Record<string, unknown>;
    expect(outputRouting).toBeDefined();
    expect(outputRouting.by_confidence).toBeDefined();

    expect(rules.auto_triggers).toBeDefined();
  });

  it("default_model が gpt-4o-mini であること", () => {
    const llm = rules.llm as Record<string, unknown>;
    expect(llm.default_model).toBe("gpt-4o-mini");
  });

  it("stages 配下の各ステージが model と output キーを持つこと", () => {
    const stages = rules.stages as Record<string, Record<string, unknown>>;
    expect(stages).toBeDefined();

    for (const [name, stage] of Object.entries(stages)) {
      expect(stage.model, `${name} に model がない`).toBeDefined();
      expect(stage.output, `${name} に output がない`).toBeDefined();
    }
  });

  it("output_routing.by_confidence が high, medium, low の3キーを持つこと", () => {
    const outputRouting = rules.output_routing as Record<string, unknown>;
    const byConfidence = outputRouting.by_confidence as Record<string, unknown>;
    expect(Object.keys(byConfidence).sort()).toEqual(["high", "low", "medium"]);
  });

  it("output_routing.confidence_source が定義されていること", () => {
    const outputRouting = rules.output_routing as Record<string, unknown>;
    expect(outputRouting.confidence_source).toBeDefined();
  });

  it("auto_triggers 配下の各トリガーが enabled, allow, deny を持つこと", () => {
    const autoTriggers = rules.auto_triggers as Record<
      string,
      Record<string, unknown>
    >;
    expect(autoTriggers).toBeDefined();

    for (const [name, trigger] of Object.entries(autoTriggers)) {
      expect(
        trigger.enabled,
        `${name} に enabled がない`,
      ).toBeDefined();
      expect(trigger.allow, `${name} に allow がない`).toBeDefined();
      expect(trigger.deny, `${name} に deny がない`).toBeDefined();
    }
  });

  it("confidence.type が enum であり values に high, medium, low が含まれること", () => {
    const confidence = rules.confidence as Record<string, unknown>;
    expect(confidence).toBeDefined();
    expect(confidence.type).toBe("enum");

    const values = confidence.values as string[];
    expect(values).toContain("high");
    expect(values).toContain("medium");
    expect(values).toContain("low");
  });
});

describe("templates/prompts", () => {
  const mdFiles = getMarkdownFiles(PROMPTS_DIR);

  it("16 個の md ファイルが存在すること", () => {
    expect(mdFiles.length).toBe(16);
  });

  it("全 md ファイルが空でないこと", () => {
    for (const filePath of mdFiles) {
      const content = readFileSync(filePath, "utf-8");
      expect(content.trim().length, `${filePath} が空`).toBeGreaterThan(0);
    }
  });

  it("変数プレースホルダが {{book.*}} 以外を使用していないこと", () => {
    const placeholderPattern = /\{\{([^}]+)\}\}/g;

    for (const filePath of mdFiles) {
      const content = readFileSync(filePath, "utf-8");
      let match: RegExpExecArray | null;

      while ((match = placeholderPattern.exec(content)) !== null) {
        const variable = match[1];
        expect(variable, `${filePath} に不正な変数 {{${variable}}} がある`).toMatch(
          /^book\./,
        );
      }
    }
  });

  it("使用される変数名が規約で定義された変数のみであること", () => {
    const placeholderPattern = /\{\{([^}]+)\}\}/g;

    for (const filePath of mdFiles) {
      const content = readFileSync(filePath, "utf-8");
      let match: RegExpExecArray | null;

      while ((match = placeholderPattern.exec(content)) !== null) {
        const variable = match[1];
        expect(
          ALLOWED_VARIABLES,
          `${filePath} に規約外の変数 {{${variable}}} がある`,
        ).toContain(variable);
      }
    }
  });
});

describe("deep_thinking_fiction.system.md", () => {
  const content = readFileSync(
    join(PROMPTS_DIR, "deep_thinking_fiction.system.md"),
    "utf-8",
  );

  it("必須構造の文言が含まれること（0〜7 の見出し）", () => {
    const requiredSections = [
      "非ネタバレあらすじ",
      "この物語が仕掛ける思考実験は何か",
      "世界のルール",
      "ジレンマ構造",
      "見えない前提",
      "現実への接続",
      "今日の問い",
      "読むときのコツ",
    ];

    for (const section of requiredSections) {
      expect(content, `必須構造「${section}」が含まれていない`).toContain(
        section,
      );
    }
  });

  it("アンカー密度 6〜10 の要件が記述されていること", () => {
    expect(content).toContain("6〜10");
  });
});
