import { describe, expect, test } from 'bun:test';
import { generateModelFileContent } from '../src/cli/generateModel';

function tableNameOf(className: string): string {
  const content = generateModelFileContent(className);
  const match = /@Table\('([^']+)'\)/.exec(content);
  return match![1]!;
}

describe('generateModelFileContent', () => {
  test('Modelを継承し@Tableでクラス名を小文字始まりにした複数形のテーブル名を指定する', () => {
    const content = generateModelFileContent('Job');
    expect(content).toContain(`import { Column, Model, Table } from 'disbord';`);
    expect(content).toContain(`@Table('jobs')`);
    expect(content).toContain('export class Job extends Model<Job.Data> {');
  });

  test('通常は末尾にsを付ける', () => {
    expect(tableNameOf('User')).toBe('users');
  });

  test('複数の単語からなる名前はsnake_caseにしてから複数形にする', () => {
    expect(tableNameOf('WorkTime')).toBe('work_times');
    expect(tableNameOf('OrderItem')).toBe('order_items');
    expect(tableNameOf('UserCategory')).toBe('user_categories');
  });

  test('s/x/z/ch/shで終わる名前はesを付ける', () => {
    expect(tableNameOf('Class')).toBe('classes');
    expect(tableNameOf('Status')).toBe('statuses');
    expect(tableNameOf('Box')).toBe('boxes');
    expect(tableNameOf('Quiz')).toBe('quizes');
    expect(tableNameOf('Church')).toBe('churches');
    expect(tableNameOf('Wish')).toBe('wishes');
  });

  test('子音+yで終わる名前はyをiesに変える', () => {
    expect(tableNameOf('Category')).toBe('categories');
    expect(tableNameOf('Company')).toBe('companies');
  });

  test('母音+yで終わる名前はそのままsを付ける', () => {
    expect(tableNameOf('Toy')).toBe('toys');
  });

  test('f/feで終わる名前はvesに変える', () => {
    expect(tableNameOf('Leaf')).toBe('leaves');
    expect(tableNameOf('Life')).toBe('lives');
  });

  test('子音+oで終わる名前はesを付ける', () => {
    expect(tableNameOf('Hero')).toBe('heroes');
  });

  test('サンプルのcolumnとData型を含む(staticではなくinstanceのaccessor)', () => {
    const content = generateModelFileContent('Job');
    expect(content).toContain(`@Column('text')`);
    expect(content).toContain('accessor sample!: string;');
    expect(content).not.toContain('static accessor');
    expect(content).not.toContain('public get sample()');
    expect(content).toContain('export namespace Job {');
    expect(content).toContain('export type Data = { sample: string };');
  });
});
