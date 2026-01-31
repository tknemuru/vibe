[Book]
Title: {{book.title}}
Authors: {{book.authors}}
Publisher: {{book.publisher}}
Published: {{book.published_date}}
Description:
{{book.description}}

この作品が「思考型フィクション」に該当するか判定してください。
迷った場合は false に寄せてください。

出力は以下の JSON 形式のみで返してください。
{
  "thinking_fiction": true | false,
  "confidence": "high" | "medium" | "low",
  "reason": "1行理由"
}
