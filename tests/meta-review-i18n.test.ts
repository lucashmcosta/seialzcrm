import {test,expect} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {uiEnglish} from '../src/lib/ui-translations';
const roots=['src/pages/social','src/pages/marketing','src/components/integrations/meta','src/components/integrations/meta-capi','src/components/integrations/meta-lead-ads','src/components/integrations/meta-whatsapp-cloud'];
const files=['src/pages/settings/MetaIntegrationPage.tsx','src/components/settings/GeneralSettings.tsx','src/components/settings/SettingsLayout.tsx','src/components/Layout.tsx','src/components/seialz/SeialzSidebar.tsx'];
function collect(dir:string){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())collect(f);else if(/\.tsx?$/.test(f))files.push(f);}}
roots.forEach(collect);
test('review routes have English translations for literal UI keys and no frozen locale values',()=>{
  const issues:string[]=[];
  for(const file of files){
    const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node:ts.Node){
      if(ts.isCallExpression(node)&&node.expression.getText(sf)==='uiText'){
        const key=node.arguments[0];
        if(key && ts.isStringLiteral(key) && !uiEnglish[key.text]) issues.push(`${file}: missing ${key.text}`);
        let parent:ts.Node|undefined=node.parent;
        while(parent&&!ts.isFunctionLike(parent))parent=parent.parent;
        if(!parent) issues.push(`${file}: locale translated during module initialization`);
      }
      if(ts.isStringLiteral(node) && /^(Salvando|Validando|Verificando|Conectando|Carregando)\.{3}$/.test(node.text)) {
        if(!ts.isCallExpression(node.parent) || node.parent.expression.getText(sf)!=='uiText')
          issues.push(`${file}: untranslated loading state ${node.text}`);
      }
      ts.forEachChild(node,visit);
    }
    visit(sf);
  }
  expect(issues).toEqual([]);
});
