const P=require('../assets/js/pptx.js'); const fs=require('fs');
(async()=>{
 const d=P.create({title:'Отчёт МУАД',author:'МУАД',subject:'Январь 2026'});
 let s=d.slide({bg:'0B1B33'});
 s.rect({x:0,y:0,w:1280,h:720,fill:'0B1B33'});
 s.rect({x:72,y:250,w:60,h:5,fill:'F0A202'});
 s.text({x:72,y:280,w:900,h:70,text:'Выполнение объёмов работ',size:38,bold:true,color:'FFFFFF'});
 s.text({x:72,y:360,w:900,h:40,text:'Январь 2026 · предварительный отчёт',size:18,color:'9FB3CF'});
 s.rect({x:900,y:100,w:300,h:200,fill:'FFFFFF',alpha:0.08,radius:true});
 s=d.slide();
 s.text({x:64,y:40,w:800,h:40,text:'Свод по участкам',size:26,bold:true,color:'14284B'});
 s.table({x:64,y:110,w:1150,rowH:30,headerH:36,colWidths:[3,1.4,1.4,1,1.2],rows:[
   ['Участок','План','Факт','%','Статус'],
   ['Ленский ДУ','7 705,00','7 100,25',{text:'92,1%',align:'right',color:'B45309',bold:true},'Открыт'],
   ['Дорожный участок №2','3 146,00','3 300,10',{text:'104,9%',align:'right',color:'0E7C4B',bold:true},'Закрыт']
 ]});
 s.barChart({x:64,y:330,w:700,items:[{label:'ЛДУ',value:92,text:'92%'},{label:'ДУ-2',value:105,text:'105%',color:'0E9F6E'}],max:120});
 s.columnChart({x:880,y:340,w:330,h:180,items:[{label:'дек',plan:100,fact:90},{label:'янв',plan:120,fact:126}]});
 const blob=await d.build();
 fs.writeFileSync(process.argv[2]||'/tmp/test.pptx',Buffer.from(await blob.arrayBuffer()));
 console.log('pptx written');
})().catch(e=>{console.error('ERR',e);process.exit(1)});
