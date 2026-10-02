// dsh-destinywind-skillhub 专项测试：其它 agent 技能的发现与导入。
//
// 只验证本 fork 新增的能力：
//   1. 其它 agent 目录被发现，且一律只读
//   2. 列表带 existsInDsh 标记（目标库已有同名时为 true）
//   3. 导入把技能复制进 DSH 库，来源目录不被改动
//   4. 同名默认跳过，不覆盖目标库既有内容
//   5. 只读来源的启停/删除被服务端拒绝
//
// 全程在临时 DSH_HOME + 临时 homedir 中执行，绝不触碰真实技能库。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'skillhub-spec-'));
process.env.DSH_HOME = join(sandbox, 'dsh-home');
// 插件用 homedir() 定位其它 agent 目录，这里把 homedir 指到沙箱。
process.env.USERPROFILE = sandbox;
process.env.HOME = sandbox;

const dshSkills = join(process.env.DSH_HOME, 'skills');
const traeRoot = join(sandbox, '.trae-cn', 'skills');
const wbRoot = join(sandbox, '.workbuddy', 'skills');

function writeSkill(dir, name, desc, body, extras = {}) {
  const target = join(dir, name);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}\n`);
  for (const [file, content] of Object.entries(extras)) writeFileSync(join(target, file), content);
}

mkdirSync(dshSkills, { recursive: true });
writeSkill(traeRoot, 'alpha-skill', '来自 Trae', '正文 A', { 'extra.txt': '附带资源\n' });
writeSkill(wbRoot, 'beta-skill', '来自 WorkBuddy', '正文 B');
writeSkill(wbRoot, 'shared-skill', 'WorkBuddy 版本', '来自 WorkBuddy 的重名版本');
writeSkill(dshSkills, 'shared-skill', 'DSH 版本', 'DSH 原版');

const core = await import('file:///D:/Download/dsh%20mod/dsh-destinywind-skillhub/lib/core.js');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

// 1. 来源根与只读性
const roots = core.userRoots();
ok(roots.find((r) => r.key === 'dsh').mutable === true, 'dsh root is writable');
ok(roots.filter((r) => r.key !== 'dsh').every((r) => r.mutable === false), 'all external roots are read-only');
ok(roots.some((r) => r.key === 'trae'), 'trae root is registered');
ok(roots.some((r) => r.key === 'workbuddy'), 'workbuddy root is registered');

// 2. 发现与 existsInDsh
const snap = await core.state();
const trae = snap.roots.find((r) => r.key === 'trae');
const wb = snap.roots.find((r) => r.key === 'workbuddy');
ok(trae.skills.length === 1 && trae.skills[0].name === 'alpha-skill', 'trae skill discovered');
ok(wb.skills.length === 2, 'workbuddy skills discovered');
ok(wb.skills.find((s) => s.name === 'shared-skill').existsInDsh === true, 'duplicate marked existsInDsh');
ok(wb.skills.find((s) => s.name === 'beta-skill').existsInDsh === false, 'non-duplicate not marked');
ok(trae.skills[0].importable === true, 'external skill marked importable');
const dsh = snap.roots.find((r) => r.key === 'dsh');
ok(dsh.skills[0].existsInDsh === undefined, 'writable root carries no existsInDsh');

// 3. 导入：复制过去、来源不动
const wbBefore = readdirSync(wbRoot).sort().join(',');
const r1 = await core.importExternalSkill('workbuddy', 'beta-skill');
ok(r1.imported && r1.imported.length === 1, 'import copies one skill');
ok(existsSync(join(dshSkills, 'beta-skill', 'SKILL.md')), 'skill landed in DSH library');
ok(readdirSync(wbRoot).sort().join(',') === wbBefore, 'source directory untouched');
ok(readFileSync(join(dshSkills, 'beta-skill', 'SKILL.md'), 'utf8').includes('正文 B'), 'content copied verbatim');

// 4. 同名跳过，不覆盖
const r2 = await core.importExternalSkill('workbuddy', 'shared-skill');
ok(r2.skipped.length === 1 && r2.imported.length === 0, 'duplicate is skipped by default');
ok(readFileSync(join(dshSkills, 'shared-skill', 'SKILL.md'), 'utf8').includes('DSH 原版'), 'existing content not overwritten');

// 5. 只读来源拒绝写操作
ok((await core.setSkillEnabled(traeRoot, 'alpha-skill', false)).code === 'error.root.readonly', 'external root rejects toggle');
ok((await core.deleteSkill(traeRoot, 'alpha-skill')).code === 'error.root.readonly', 'external root rejects delete');

// 6. 整目录复制（含附带资源）；再次导入同名被跳过
const r3 = await core.importExternalSkill('trae', 'alpha-skill');
ok(r3.imported.length === 1 && existsSync(join(dshSkills, 'alpha-skill', 'extra.txt')), 'bundle extras copied');
const r4 = await core.importExternalSkill('trae', 'alpha-skill');
ok(r4.skipped.length === 1, 're-import of same skill is skipped');

// 7. 非法来源被拒
ok((await core.importExternalSkill('dsh', 'alpha-skill')).code === 'error.source.unknownRoot', 'writable root is not an import source');
ok((await core.importExternalSkill('nope', 'x')).code === 'error.source.unknownRoot', 'unknown root rejected');
ok((await core.importExternalSkill('trae', 'does-not-exist')).code === 'error.skill.notFound', 'missing skill rejected');

// 8. 真实目录存在时只读根不被当可写根
ok(core.entryPath(dshSkills, 'beta-skill') !== null, 'entryPath works for dsh root');

rmSync(sandbox, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
