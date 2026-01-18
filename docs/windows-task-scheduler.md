# Windows タスクスケジューラ設定ガイド

DREを定期的に自動実行するためのWindowsタスクスケジューラの設定方法です。

## 前提条件

- Windows 11 + WSL2 環境
- DREが正常にセットアップされていること（`dre doctor` でOKになること）

## 1. バッチファイルの作成

`C:\Users\<username>\dre-run.bat` を作成:

```batch
@echo off
wsl -d Ubuntu -e bash -c "cd /home/<wsl-username>/projects/dre && /home/<wsl-username>/.nvm/versions/node/v20.x.x/bin/node dist/cli.js run-due"
```

**注意**: 以下を環境に合わせて変更してください:
- `Ubuntu` → WSLディストリビューション名（`wsl -l` で確認）
- `/home/<wsl-username>/projects/dre` → DREのインストールパス
- Node.jsのパス（`which node` で確認）

## 2. タスクスケジューラの設定

### 2.1 タスクスケジューラを開く

1. Windowsキー + R で「ファイル名を指定して実行」を開く
2. `taskschd.msc` と入力してEnter

### 2.2 新しいタスクの作成

1. 右側の「タスクの作成...」をクリック

### 2.3 全般タブ

- **名前**: `DRE Run Due`
- **説明**: DREの定期実行
- **ユーザーがログオンしているかどうかにかかわらず実行する**: チェック
- **最上位の特権で実行する**: チェックしない

### 2.4 トリガータブ

「新規...」をクリック:

- **タスクの開始**: スケジュールに従う
- **設定**: 毎日
- **開始**: 任意の日時（例: 今日 00:00:00）
- **詳細設定**:
  - **繰り返し間隔**: 30分間
  - **継続時間**: 無期限
- **有効**: チェック

### 2.5 操作タブ

「新規...」をクリック:

- **操作**: プログラムの開始
- **プログラム/スクリプト**: `C:\Users\<username>\dre-run.bat`
- **引数**: （空欄）
- **開始**: （空欄）

### 2.6 条件タブ

- **コンピューターがAC電源で動作している場合のみタスクを開始する**: チェックを外す
- **コンピューターをスリープ解除してこのタスクを実行する**: お好みで

### 2.7 設定タブ

- **タスクを要求時に実行する**: チェック
- **タスクが失敗した場合の再起動**: お好みで
- **タスクを停止するまでの時間**: 1時間

## 3. タスクの確認

1. 作成したタスクを右クリック
2. 「実行」を選択して手動実行
3. 「履歴」タブでログを確認

## 4. ログの確認

WSL内でログを確認:

```bash
# 最新の実行状態を確認
dre run-due --dry-run
```

## トラブルシューティング

### タスクが実行されない

1. タスクスケジューラの履歴タブでエラーを確認
2. バッチファイルを直接ダブルクリックして動作確認
3. WSLが起動していることを確認

### 「アクセスが拒否されました」

1. タスクのプロパティを開く
2. 「ユーザーまたはグループの変更」で現在のユーザーを選択
3. パスワードを再入力

### WSL関連のエラー

1. WSLのバージョンを確認: `wsl --version`
2. ディストリビューションが起動していることを確認: `wsl -l -v`
3. Node.jsのパスが正しいことを確認

## 推奨設定

- **実行間隔**: 30分（ジョブのintervalは3時間なので、30分ごとにチェックすれば十分）
- **PC稼働時間**: PCが起動している時間帯に合わせて調整
- **ログ保持**: 必要に応じてログファイル出力を追加

## バッチファイルの改良版（ログ出力付き）

```batch
@echo off
set LOGFILE=C:\Users\<username>\dre-logs\%date:~0,4%%date:~5,2%%date:~8,2%.log
if not exist C:\Users\<username>\dre-logs mkdir C:\Users\<username>\dre-logs
echo [%date% %time%] Starting dre run-due >> %LOGFILE%
wsl -d Ubuntu -e bash -c "cd /home/<wsl-username>/projects/dre && /home/<wsl-username>/.nvm/versions/node/v20.x.x/bin/node dist/cli.js run-due" >> %LOGFILE% 2>&1
echo [%date% %time%] Completed >> %LOGFILE%
```
