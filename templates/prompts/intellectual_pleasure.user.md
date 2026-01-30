[Book]
Title: {{book.title}}
Authors: {{book.authors}}
Publisher: {{book.publisher}}
Published: {{book.published_date}}
Description:
{{book.description}}

この本が「知的快楽型」に該当するかを判定してください。
仕事に役立つかではなく、理解する喜び・思考の残り方を基準にしてください。

出力は以下の JSON 形式のみで返してください。
{
  "intellectual_pleasure": true | false,
  "confidence": "high" | "medium" | "low",
  "reason": "1行理由"
}
