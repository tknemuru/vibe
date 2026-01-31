[Book]
Title: {{book.title}}
Authors: {{book.authors}}
Publisher: {{book.publisher}}
Published: {{book.published_date}}
Description:
{{book.description}}

この本について、Editorial を作る価値があるか判定してください。
少しでも刺さる可能性があれば true に寄せ、false は慎重にしてください。

出力は以下の JSON 形式のみで返してください。
{
  "interested": true | false,
  "confidence": "high" | "medium" | "low",
  "reason": "1行理由"
}
