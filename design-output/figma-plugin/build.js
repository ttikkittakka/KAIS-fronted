async function buildGardenDesign(assets) {
 const page=figma.currentPage;
 if(page.children.some(n=>n.name==='오늘의 정원 · Mobile MVP'))throw Error('이 페이지에 같은 디자인이 있습니다. 빈 페이지에서 실행하세요.');
 const ids=[], collections=[], variables=[], styles=[];
 const fonts=await figma.listAvailableFontsAsync();
 const font=fonts.find(f=>['Gowun Dodum','Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo'].includes(f.fontName.family)&&f.fontName.style==='Regular')?.fontName;
 if(!font)throw Error('Gowun Dodum 또는 Noto Sans KR 한글 폰트를 준비해주세요.');
 await figma.loadFontAsync(font);
 const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
 const colors={paper:'#F7F5EE',surface:'#FFFDF8',forest:'#3F5D46',ink:'#293D32',muted:'#626E63',sage:'#DFE8DC',line:'#B5C1AE',white:'#FFFFFF'};
 const primitives=figma.variables.createVariableCollection('Garden / Primitives');collections.push(primitives.id);
 const semantic=figma.variables.createVariableCollection('Garden / Semantic');collections.push(semantic.id);
 const vars={};
 for(const [key,value] of Object.entries(colors)){
  const p=figma.variables.createVariable('palette/'+key,primitives,'COLOR');p.scopes=[];p.setValueForMode(primitives.defaultModeId,rgb(value));p.setVariableCodeSyntax('WEB',`var(--palette-${key})`);variables.push(p.id);
  const v=figma.variables.createVariable('color/'+key,semantic,'COLOR');v.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];v.setValueForMode(semantic.defaultModeId,{type:'VARIABLE_ALIAS',id:p.id});v.setVariableCodeSyntax('WEB',`var(--${key})`);vars[key]=v;variables.push(v.id);
 }
 for(const n of [8,12,16,18,20,24,32,48,56]){const v=figma.variables.createVariable('space/'+n,semantic,'FLOAT');v.scopes=['GAP','CORNER_RADIUS','WIDTH_HEIGHT'];v.setValueForMode(semantic.defaultModeId,n);v.setVariableCodeSyntax('WEB',`var(--space-${n})`);vars[n]=v;variables.push(v.id);}
 const textStyles={};for(const [name,size] of [['Display',28],['Title',24],['Body',16],['Caption',13]]){const s=figma.createTextStyle();s.name='Garden/'+name;s.fontName=font;s.fontSize=size;s.lineHeight={unit:'PERCENT',value:150};styles.push(s.id);textStyles[size]=s;}
 const track=n=>{ids.push(n.id);return n;};
 const paint=(key)=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(colors[key])},'color',vars[key]);
 function fill(n,key){n.fills=[paint(key)];}
 function layout(n,w,pad=0,gap=12){n.layoutMode='VERTICAL';n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='FIXED';n.resize(w,100);n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=pad;n.itemSpacing=gap;if(vars[pad])for(const p of ['paddingTop','paddingBottom','paddingLeft','paddingRight'])n.setBoundVariable(p,vars[pad]);n.setBoundVariable('itemSpacing',vars[gap]);n.fills=[];return n;}
 function box(name,w=342,pad=0,gap=12){const n=track(typeof figma.createAutoLayout==='function'?figma.createAutoLayout():figma.createFrame());n.name=name;return layout(n,w,pad,gap);}
 function text(parent,value,size=16,color='ink',width=342){const n=track(figma.createText());n.fontName=font;n.fontSize=size;n.characters=value;n.textAutoResize='HEIGHT';n.resize(width,32);n.lineHeight={unit:'PERCENT',value:150};fill(n,color);if(textStyles[size])n.textStyleId=textStyles[size].id;parent.appendChild(n);return n;}
 function rounded(n,r=20){n.cornerRadius=r;n.setBoundVariable('cornerRadius',vars[r]);}
 let setY=1120;const componentMap={};
 function variants(name,names,build,width=342){const comps=names.map(state=>{const n=track(figma.createComponent());n.name='State='+state;layout(n,width,16,12);rounded(n);fill(n,'surface');build(n,state);return n;});const set=track(figma.combineAsVariants(comps,page));set.name=name;set.x=80;set.y=setY;let x=24;for(const c of comps){c.x=x;c.y=24;x+=c.width+24;}set.resize(x,Math.max(...comps.map(c=>c.height))+48);setY+=set.height+72;componentMap[name]=Object.fromEntries(names.map((name,i)=>[name,comps[i]]));return set;}
 variants('Button',['Primary','Secondary','Text'],(n,s)=>{fill(n,s==='Primary'?'forest':s==='Secondary'?'sage':'paper');n.counterAxisAlignItems='CENTER';text(n,s==='Primary'?'다음':s==='Secondary'?'돌아가기':'건너뛰어도 괜찮아요.',16,s==='Primary'?'white':'forest',310);n.minHeight=56;});
 variants('Choice Card',['Default','Selected'],(n,s)=>{fill(n,s==='Selected'?'sage':'surface');n.strokes=[paint('forest')];n.strokeWeight=s==='Selected'?2:1;const t=text(n,s==='Selected'?'낮음                                      ✓':'보통',16,'ink',310);const p=n.addComponentProperty('Label','TEXT',t.characters);t.componentPropertyReferences={characters:p};n.minHeight=60;});
 variants('Care Card',['Default','Selected','Completed'],(n,s)=>{fill(n,s==='Completed'?'sage':'surface');text(n,'물 한 컵',16,'ink',310);text(n,'몸에 물을 조금 채워줘요.\n1분 · 아주 쉬움',13,'muted',310);text(n,s==='Completed'?'돌봄 완료 ✓':s==='Selected'?'완료했어요':'해볼게요',16,'forest',310);});
 variants('Top Bar',['Default','Back'],(n,s)=>{fill(n,'paper');text(n,s==='Back'?'‹                  오늘의 나':'오늘의 정원',16,'ink',310);});
 variants('Bottom Navigation',['Garden','Records'],(n,s)=>{fill(n,'surface');text(n,s==='Garden'?'정원 ✓                           기록':'정원                           기록 ✓',16,'forest',310);});
 variants('Progress',['1','2','3','4'],(n,s)=>{fill(n,'paper');text(n,`${s} / 4                                      약 30초`,13,'muted',310);const bar=track(figma.createRectangle());bar.resize(310*(Number(s)/4),4);fill(bar,'forest');n.appendChild(bar);});
 const plantMapping={Normal:'normal',LowEnergy:'low',Tired:'low',Excited:'complete',Recovering:'recovering-1',Complete:'complete',Growing:'growing'};
 const plantSet=variants('Plant',Object.keys(plantMapping),(n,s)=>{n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=0;n.fills=[];const art=track(figma.createNodeFromSvg(assets[plantMapping[s]]));art.name='원본 Rive 렌더 · 비율 변경 금지';art.resize(300,300);n.appendChild(art);n.description=`원본 식물최종.riv. UX state=${s}. Input 0개. Tired/Excited/Recovering은 독립 제어 보장 없음. 실제 재생은 웹 프로토타입 확인.`;},300);
 plantSet.description='캐릭터는 원본 Rive 렌더. Normal=idle; LowEnergy=low_energy; Complete=통통; Growing=new_leaf 뿅. 미지원 입력을 만들지 않음.';
 function instance(parent,name,state,width=342){const n=track(componentMap[name][state].createInstance());parent.appendChild(n);n.resize(width,n.height);return n;}
 function override(n,value){const t=n.findOne(c=>c.type==='TEXT');if(t)t.characters=value;return n;}
 const screens={};let x=80;
 function screen(name){const n=box(name,390,24,16);fill(n,'paper');rounded(n,24);n.resize(390,844);n.primaryAxisSizingMode='FIXED';n.clipsContent=false;n.x=x;n.y=120;x+=430;page.appendChild(n);screens[name]=n;return n;}
 function title(n,t){return override(instance(n,'Top Bar','Default'),t);}
 function character(n,state){return instance(n,'Plant',state,300);}
 function button(n,label,style='Primary'){return override(instance(n,'Button',style),label);}
 function nav(n,state){return instance(n,'Bottom Navigation',state);}
 const links=[];const route=(node,to)=>links.push([node,to]);
 const onboarding=screen('01 Onboarding');character(onboarding,'Normal');text(onboarding,'나를 돌보는 작은\n정원을 만들어볼까요?',28);text(onboarding,'오늘의 나를 살펴보면\n식물도 조금씩 달라져요.',16,'muted');route(button(onboarding,'시작하기'),'02 오늘의 정원');
 const home=screen('02 오늘의 정원');title(home,'오늘의 정원');character(home,'Normal');text(home,'오늘의 모습',13,'muted');text(home,'오늘의 나를\n가볍게 살펴볼까요?',24);route(button(home,'오늘의 나 기록하기'),'03 오늘의 나 · 1');text(home,'작은 시작도 충분해요.\n좋은 날도, 지친 날도 있는 그대로요.',13,'muted');route(nav(home,'Garden'),'05 나의 정원');
 const questions=[['어젯밤 잠은 어땠나요?',['많이 힘들었어요','조금 뒤척였어요','그냥 그래요','괜찮게 잤어요']],['지금 에너지는 어떤가요?',['매우 낮음','낮음','보통','괜찮음','충분함']],['오늘 식사는 어땠나요?',['거의 못 먹었어요','조금 먹었어요','평소와 비슷해요','든든하게 먹었어요']],['지금 기분은 어떤가요?',['많이 지쳐요','조금 무거워요','잔잔해요','괜찮아요','가벼워요']]];
 for(let i=0;i<4;i++){const n=screen('03 오늘의 나 · '+(i+1));title(n,'오늘의 나');instance(n,'Progress',String(i+1));text(n,questions[i][0],24);text(n,'지금 가장 가까운 것을 골라주세요.',13,'muted');for(const [j,answer] of questions[i][1].entries()){const choice=override(instance(n,'Choice Card',j===1?'Selected':'Default'),answer+(j===1?'   ✓':''));route(choice,i===3?'03 오늘의 한마디':'03 오늘의 나 · '+(i+2));}route(button(n,'다음'),i===3?'03 오늘의 한마디':'03 오늘의 나 · '+(i+2));}
 const memo=screen('03 오늘의 한마디');title(memo,'오늘의 나');instance(memo,'Progress','4');text(memo,'오늘을 한마디로\n남겨볼까요?',28);text(memo,'오늘의 한마디 (선택)',16);const input=box('Text field',342,20,12);fill(input,'surface');rounded(input);memo.appendChild(input);text(input,'마음에 남은 순간을 적어보세요.',16,'muted',302);input.minHeight=180;route(button(memo,'오늘의 나를 살펴봤어요'),'04 작은 돌봄 · 0');route(button(memo,'건너뛰어도 괜찮아요.','Text'),'04 작은 돌봄 · 0');
 for(let count=0;count<=3;count++){const n=screen('04 작은 돌봄 · '+count);title(n,'오늘의 작은 돌봄');text(n,'오늘의 나를 살펴봤어요.',13,'muted');text(n,count===3?'오늘의 나를 위해\n세 가지를 해냈어요.':'오늘은 조금 지친 날이네요.',24);character(n,count===3?'Complete':'LowEnergy');text(n,count===3?'나를 돌본 시간이 하나 더 남았어요.':'아주 작은 것 하나만 해볼까요?',13,'muted');for(const [i,label] of ['물 한 컵','하늘 바라보기','5분 걷기'].entries()){const card=override(instance(n,'Care Card',i<count?'Completed':'Default'),label);if(i>=count)route(card,'04 작은 돌봄 · '+Math.min(count+1,3));}route(button(n,'정원으로 돌아가기','Text'),'02 오늘의 정원');n.resize(390,Math.max(1000,n.children.reduce((h,c)=>Math.max(h,c.y+c.height+24),0)));}
 const garden=screen('05 나의 정원');title(garden,'나의 정원');text(garden,'조금씩 나를\n돌봤어요.',28);character(garden,'Growing');text(garden,'돌봄의 흔적 · 예시',13,'muted');for(const value of ['9/13   하늘을 봤어요','9/12   물을 마셨어요','9/11   산책했어요','9/10   다시 찾아왔어요'])text(garden,value);text(garden,'기록하지 않은 날도\n정원은 조용히 기다려요.',13,'muted');route(nav(garden,'Records'),'02 오늘의 정원');
 for(const [node,destination] of links)await node.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:screens[destination].id,navigation:'NAVIGATE',transition:null,preserveScrollPosition:false}]}]);
 const cover=box('오늘의 정원 · Mobile MVP',1200,24,16);cover.x=80;cover.y=-300;fill(cover,'surface');page.appendChild(cover);text(cover,'오늘의 정원 · 원본 Rive 중심 모바일 MVP',28,'ink',1152);text(cover,'Figma: 편집 가능한 UI·Variants·Auto Layout·화면 전환. 실제 Rive 재생: http://localhost:3000/design-preview/index.html',16,'muted',1152);text(cover,'프로토타입 안내: Figma 경로는 선택 예시입니다. 저장 검증·자유로운 행동 순서·상태 복원은 웹 프로토타입에서 확인합니다.',13,'muted',1152);
 return {createdNodeIds:ids,collectionIds:collections,variableIds:variables,textStyleIds:styles,screenIds:Object.fromEntries(Object.entries(screens).map(([k,v])=>[k,v.id])),componentSets:Object.keys(componentMap),font,limitations:['Rive is represented by source-rendered vectors, not native Figma playback','Figma choice paths demonstrate an example; web prototype handles real state']};
}
