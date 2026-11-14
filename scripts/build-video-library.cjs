'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','video-library.js'),'utf8');
const file=path.join(root,'web','app.js'),app=fs.readFileSync(file,'utf8');
function region(text,a,b){
 const i=text.indexOf(a),j=text.indexOf(b,i+a.length);
 if(i<0||j<0||text.indexOf(a,i+a.length)>=0||text.indexOf(b,j+b.length)>=0)
   throw Error('Missing or duplicate Phase 5 video source markers');
 return {i,j,inside:text.slice(i+a.length,j)};
}
const src=region(source,'/* video-library:portable:start */','/* video-library:portable:end */');
const start='  /* GENERATED VIDEO LIBRARY START */',end='  /* GENERATED VIDEO LIBRARY END */';
const dst=region(app,start,end);
const payload=[
 start,'  const videoLibrary=(()=>{',
 ...src.inside.trim().split('\n').map(line=>'    '+line),
 '    return {VIDEO_LIBRARY_SCHEMA,VIDEO_STORYBOARD_MAX,VIDEO_PLAYBACK_MAX,',
 '      VIDEO_STORYBOARD_FRAMES,VIDEO_MAX_DIMENSION,VIDEO_MAX_PIXELS,VIDEO_CATALOG_PAGE,',
 '      VIDEO_EVIDENCE,videoMime,videoFormat,videoEligibility,videoValidateSignature,',
 '      videoStoryboardTimes,videoEvidence,videoList};',
 '  })();',end
].join('\n');
const result=app.slice(0,dst.i)+payload+app.slice(dst.j+end.length);
if(process.argv.includes('--check')){
 if(result!==app){console.error('Video Library generated browser bundle is stale');process.exitCode=1;}
 else console.log('Video Library source matches browser bundle');
}else{fs.writeFileSync(file,result);console.log('Regenerated Video Library browser bundle');}
