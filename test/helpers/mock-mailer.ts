/**
 * メール送信モック
 * @description
 *   テスト時にメール送信を模擬し、送信内容を記録する。
 */

import type { Book } from "../../src/db/dao.js";

/**
 * 送信されたメールの記録
 */
export interface SentMail {
  books: Book[];
  jobName: string;
  timestamp: string;
}

/**
 * モックMailerクラス
 */
export class MockMailer {
  /** 送信されたメールの履歴 */
  public sentMails: SentMail[] = [];

  /**
   * メール送信を模擬する
   * @param books - 送信対象の書籍リスト
   * @param jobName - ジョブ名
   */
  async sendBookDigestEmail(books: Book[], jobName: string = "test"): Promise<void> {
    this.sentMails.push({
      books,
      jobName,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 送信履歴をクリアする
   */
  reset(): void {
    this.sentMails = [];
  }

  /**
   * 最後に送信されたメールを取得する
   */
  getLastSentMail(): SentMail | undefined {
    return this.sentMails[this.sentMails.length - 1];
  }

  /**
   * 送信されたメールの総数を取得する
   */
  getSentCount(): number {
    return this.sentMails.length;
  }
}

/**
 * グローバルなモックMailerインスタンス
 */
export const mockMailer = new MockMailer();
