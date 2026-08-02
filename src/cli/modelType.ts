import { regenerateModelDataBlocks } from './modelDataBlock';
import { readBotConfig } from './readBotConfig';

/**
 * `disbord migrate`が内部で行う`namespace Xxx { export type Data = ... }`の再生成だけを
 * 単体で叩けるようにしたコマンド。schema.ts再生成・migrationファイルの差分計算・DB接続は
 * 一切行わないため、「カラムを増やしたがDBはまだ触りたくない」ような場面で型だけ素早く
 * 同期したいときに使う（DBへ実際に反映するには別途`disbord migrate`が必要）。
 */
export async function runModelType(cwd: string): Promise<void> {
  const config = await readBotConfig(cwd);
  if (!config.db?.enable) {
    throw new Error('disbord: disbord.config.tsでdb.enableが有効になっていません');
  }

  const models = await regenerateModelDataBlocks(cwd);
  console.log(`disbord: ${models.length}件のモデルのData型を再生成しました`);
}
