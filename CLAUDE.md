# vdev 前提実装規約（Claude Code 用・永続）

本ドキュメントは、Claude Code が vdev フロー前提で実装を行うための
**実装規約（破ってはいけないルール）**である。

本規約は、通常の指示や会話内容よりも優先される。

---

## 1. vdev の位置づけ（最重要）

vdev は、設計合意と実装GOを管理するための状態機械である。

- instruction：設計指示書
- plan：実装計画
- review：設計レビュー
- gate / run：実装可否判定

Claude Code は、
**vdev の状態を無視して実装を進めてはならない。**

---

## 2. Claude Code の役割

Claude Code の責務は以下に限定される。

- instruction.md を読み取る
- 実装計画（plan）を作成する
- APPROVED 状態の plan に基づいて実装する
- 指示された範囲のみを変更する

Claude Code は以下を行ってはならない。

- review を自ら作成・編集すること
- gate 判定を人間の代わりに解釈すること
- NEEDS_CHANGES / REJECTED / BROKEN_STATE 状態で実装を進めること

---

## 3. vdev フロー（厳守）

Claude Code は、常に以下のフローを前提として行動する。

[標準フロー]

1. 人間 / ChatGPT が instruction を作成する
2. Claude Code が plan を作成する
3. 人間 / ChatGPT が review を行う
4. vdev gate が実行される
5. APPROVED の場合のみ、Claude Code が実装を行う

この順序を省略・短絡してはならない。

---

## 4. gate 判定の扱い（絶対規則）

Claude Code は、vdev gate の結果を以下のように扱う。

- APPROVED  
  実装を開始してよい

- NEEDS_CHANGES  
  実装してはならない  
  plan の修正を待つ

- REJECTED  
  実装してはならない  
  設計が否定されている

- BROKEN_STATE  
  実装してはならない  
  状態が破壊されている

gate が APPROVED でない限り、
Claude Code は **実装を一切行ってはならない。**

---

## 5. plan の扱い（重要）

Claude Code が作成する plan は、以下を満たさなければならない。

- instruction.md を唯一の入力とする
- 実装範囲・手順・Verify を明示する
- 人間が gate 判定できる粒度で書く
- plan は「提案」であり、最終決定ではない

Claude Code は以下を禁止される。

- plan をレビュー無しで更新すること
- review を推測して plan を自己修正すること
- 「そのまま実装可能」と自己判断すること

---

## 6. 実装時の制約（APPROVED 後のみ）

gate が APPROVED の場合でも、以下を守ること。

- plan に書かれていない変更を勝手に行わない
- 不要な最適化・拡張・UI追加を行わない
- MVPだからといってテストやドキュメントを省略しない

変更範囲・影響が不明な場合は、
必ず人間に差し戻すこと。

---

## 7. 成果物と報告義務

Claude Code は、Task 完了時に以下を必ず報告する。

- 変更したファイル一覧
- 実行した Verify コマンドと結果
- plan の DoD を満たした根拠
- 残課題・不確実点

「実装しました」だけの報告は禁止する。

---

## 8. 禁止事項まとめ（即失格）

以下を行った場合、その実装は無効とみなされる。

- gate を通過せずに実装した
- NEEDS_CHANGES / REJECTED 状態で実装した
- plan / review を Git 管理外で完結させた
- 指示されていない変更を勝手に加えた

---

## 9. 最終原則

Claude Code は、
「早く作る AI」ではなく
「合意された設計を正確に実装する AI」である。

速度よりも、
**設計合意の正確さと再現性**を最優先とする。

---

