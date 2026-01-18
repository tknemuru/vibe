# DRE ロールバック・停止手順

## dre-serve サービスの停止・無効化

### 一時停止

サービスを一時的に停止する場合（再起動後に自動起動する）:

```bash
sudo systemctl stop dre-serve.service
```

### 完全停止・無効化

サービスを完全に停止し、自動起動も無効化する場合:

```bash
# サービス停止
sudo systemctl stop dre-serve.service

# 自動起動を無効化
sudo systemctl disable dre-serve.service

# 状態確認
sudo systemctl status dre-serve.service
# → "disabled" かつ "inactive" であること
```

### サービスファイルの削除

サービスを完全に削除する場合:

```bash
sudo systemctl stop dre-serve.service
sudo systemctl disable dre-serve.service
sudo rm /etc/systemd/system/dre-serve.service
sudo systemctl daemon-reload
```

## daemon-reload の注意点

**重要**: サービスファイルを追加・編集・削除した後は必ず `daemon-reload` を実行してください。

```bash
sudo systemctl daemon-reload
```

### daemon-reload が必要なケース

- サービスファイル（`.service`）を新規作成した
- サービスファイルの内容を編集した
- サービスファイルを削除した

### daemon-reload を忘れると

- 変更が反映されない
- 古い設定のままサービスが動作する
- 削除したはずのサービスが systemd に認識され続ける

## 旧バージョン（vibe）への復帰について

DRE は `vibe` との後方互換性を維持しません。

- CLI コマンド名が `vibe` → `dre` に変更済み
- 設定ファイル、DB スキーマ等も変更されている可能性あり
- `vibe` への復帰手順は提供しない

旧バージョンが必要な場合は、git で該当コミットをチェックアウトし、個別に環境を構築してください。
