# DRE Ver2.0 運用ガイド

## 日常運用

### 定期実行

DREは3時間ごとにジョブを実行するよう設計されています。

```bash
# cron設定例（毎時実行、内部で3時間判定）
0 * * * * cd /path/to/dre && /usr/bin/node dist/cli.js run-due >> /var/log/dre.log 2>&1
```

Windows Task Schedulerの場合は `docs/windows-task-scheduler.md` を参照してください。

### ステータス確認

```bash
# 配信ステータス
dre mail status

# DB情報
dre db info

# 設定診断
dre doctor
```

## パイプライン概要

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Collect   │ --> │   Upsert    │ --> │   Select    │ --> │    Mail     │
│ Google Books│     │   to DB     │     │  未配信優先  │     │ DeepResearch│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. **Collect**: Google Books APIでクエリに基づき書籍を収集
2. **Upsert**: ISBN-13で重複排除してDBに保存
3. **Select**: 未配信書籍を優先選択（なければフォールバック）
4. **Mail**: DeepResearchプロンプト付きメールを送信

## 配信リセット

### ユースケース

- 同じ書籍を再度配信したい
- テスト後にステータスをクリアしたい
- 特定ジョブの書籍のみ再配信したい

### コマンド

```bash
# すべての書籍を未配信にリセット
dre mail reset --yes

# 過去7日間に配信した書籍のみリセット
dre mail reset --since 7d --yes

# 過去30日間
dre mail reset --since 30d --yes

# 過去1週間
dre mail reset --since 1w --yes

# 特定ジョブで配信した書籍のみ
dre mail reset --job ai-books --yes
```

### 確認

```bash
# リセット前後のステータス確認
dre mail status
```

## データベース管理

### バックアップ

DBリセット時は自動的にバックアップが作成されます。

```bash
# 手動バックアップ
cp data/app.db data/app.db.manual.$(date +%Y%m%d)
```

### リセット

```bash
# 確認プロンプト付き
dre db reset

# 確認スキップ
dre db reset --yes
```

リセット後、バックアップファイルが `data/app.db.bak.<timestamp>` として保存されます。

### 復元

```bash
# バックアップ一覧
ls -la data/app.db.bak.*

# 復元
cp data/app.db.bak.2024-01-15T10-30-00 data/app.db
```

## ジョブ管理

### 一時停止

```bash
# ジョブを無効化
dre job disable ai-books

# 確認
dre job ls
```

### 再開

```bash
# ジョブを有効化
dre job enable ai-books
```

### クエリの更新

```bash
# 既存クエリを置き換え
dre job update ai-books -q "新しいクエリ1" -q "新しいクエリ2"

# または config/jobs.yaml を直接編集
```

## トラブルシューティング

### ログの確認

```bash
# 直接実行でログ確認
dre run-due 2>&1 | tee dre-debug.log
```

### よくある問題

#### 書籍が収集されない

1. クエリが適切か確認
2. Google Books APIキーが有効か確認
3. クォータ状況を確認: `dre doctor`

#### メールが送信されない

1. SMTP設定を確認: `dre doctor`
2. 未配信書籍があるか確認: `dre mail status`
3. 強制送信でテスト: `dre run-due --force`

#### 同じ書籍が何度も配信される

DBが正しく更新されていない可能性があります。

```bash
# DBの状態確認
dre db info

# 必要に応じてDBリセット
dre db reset --yes
```

## 監視

### 正常動作の確認

1. `dre mail status` で定期的に配信数を確認
2. メール受信を確認
3. ログでエラーがないか確認

### アラート設定（例）

```bash
#!/bin/bash
# check-dre.sh
UNDELIVERED=$(dre mail status 2>/dev/null | grep "Undelivered:" | awk '{print $2}')
if [ "$UNDELIVERED" = "0" ]; then
  echo "Warning: No undelivered books"
fi
```

## systemd サービス

### 概要

- **使用するサービス名**: `dre-serve.service` のみ
- **重要**: `vibe-serve.service` は作成・維持しない（旧名称は非対応）

### 新規作成手順

1. サービスファイルの作成

```bash
sudo cp /path/to/dre/systemd/dre-serve.service /etc/systemd/system/
```

2. ExecStart のパスを環境に合わせて修正

```bash
sudo vim /etc/systemd/system/dre-serve.service
# ExecStart=/path/to/node /path/to/dre/dist/cli.js serve
```

3. サービスの有効化と開始

```bash
sudo systemctl daemon-reload
sudo systemctl enable dre-serve.service
sudo systemctl start dre-serve.service
```

4. 状態確認

```bash
sudo systemctl status dre-serve.service
```

### 旧サービスからの移行手順

`vibe-serve.service` から移行する場合:

1. 旧サービスの停止・無効化

```bash
sudo systemctl stop vibe-serve.service
sudo systemctl disable vibe-serve.service
sudo rm /etc/systemd/system/vibe-serve.service
sudo systemctl daemon-reload
```

2. 新サービスの設定（上記「新規作成手順」の 1〜4 を実行）

### サービス管理

```bash
# 再起動
sudo systemctl restart dre-serve.service

# ログ確認
sudo journalctl -u dre-serve.service -f

# 停止
sudo systemctl stop dre-serve.service
```
