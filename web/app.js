/* Jack's Image Vault — read-only Drive browser with verified local and GitHub updates. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const SHELL_STORAGE = 'jack-vault-settings-v2';
  const FAVORITES_STORAGE = 'jack-vault-favorites-v2';
  const REPO_STORAGE = 'jack-vault-public-update-repo-v2';
  const UPDATE_CHECK_STORAGE = 'jack-vault-last-update-check-v2';
  const DENSITY_STORAGE = 'jack-vault-gallery-density-v1';
  const APP_PREFS_STORAGE = 'jack-vault-app-preferences-v1';
  const BROWSE_STORAGE = 'jack-vault-resume-position-v1';
  const REVIEW_STORAGE = 'jack-vault-local-reviews-v1';
  const SAVED_SEARCHES_STORAGE = 'jack-vault-searches-v2.1';
  const SMART_COLLECTIONS_STORAGE = 'jack-vault-smart-collections-v1';
  const MAX_SAVED_SEARCHES = 30;
  const MAX_REVIEW_BYTES = 2600000;
  const MAX_REVIEW_ITEMS = 15000;
  const SYNC_CACHE_STORAGE = 'jack-vault-readonly-sync-cache-v1';
  const MAX_SYNC_CACHE = 1800000;
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly';
  const FALLBACK_ICONS = ['✦', '☼', '❖', '☺', '◈', '✺', '✻', '✿'];
  const DEMO = [
    ['Memes/Demo', 'Reaction collection', 'Playful illustrations and reactions', 'memes', 35],
    ['Memes/Demo', 'Creative collection', 'A colorful collection for inspiration', 'memes', 25],
    ['Jacks Photos/Demo', 'Travel collection', 'Travel memories belong here', 'photos', 20],
    ['Jacks Photos/Demo', 'Personal album', 'A home for your photographs', 'photos', 18]
  ].flatMap(([folder, base, desc, collection, total], i) => [0,1,2].map((n) => ({
    id: `example-${i}-${n}`, folder, collection: collection === 'photos' ? 'Jacks Photos' : 'Memes',
    name: `${base} ${n + 1}`, description: desc, tags: 'illustrative preview',
    captureDate: '', review: 'Illustration only', confidence: '', category: '', mime: 'image/png',
    size: 0, url: '', demo: true, total
  })));
  const startingPrefs = readPreferences();
  const state = {
    config: readSettings(),
    accessToken: null,
    expiry: 0,
    tokenClient: null,
    images: DEMO,
    folders: [],
    connected: false,
    view: 'home',
    folder: 'all',
    search: '',
    sort: 'name',
    savedSearches: [],
    activeSavedSearch: '',
    smartCollections: [],
    smartCollectionId: '',
    smartDraft: null,
    smartStorageHealthy: true,
    memoryYear: 'all',
    memorySource: 'all',
    memorySelection: {key:'all',source:'all'},
    layout: 'grid',
    density: readDensity(),
    folderQuery: '',
    page: 1,
    pageSize: startingPrefs.batchSize,
    autoLoad: startingPrefs.autoLoad,
    rememberBrowsing: startingPrefs.rememberBrowsing,
    browseSaveTimer: null,
    resumeScrollY: null,
    renderedCount: 0,
    autoLoadObserver: null,
    autoLoadPending: false,
    galleryRevision: 0,
    filtered: [],
    activeImage: null,
    returnFocus: null,
    thumbCache: new Map(),
    loadingThumbs: new Map(),
    thumbJobs: [],
    thumbErrors: new Map(),
    activeControllers: new Set(),
    runningThumbJobs: 0,
    galleryEpoch: 0,
    maxConcurrentThumbs: 5,
    observer: null,
    favorites: new Set(readFavorites()),
    reviewEdits: new Map(),
    reviewFilter: 'pending',
    reviewDirty: false,
    installPrompt: null,
    updater: null,
    updateRepo: readUpdateRepo(),
    remoteRelease: null,
    mediaType: 'all',
    inventory: [], // Spreadsheet snapshot. Never mutated by Drive sync.
    folderSources: [], // Live folders, including newly discovered nested folders.
    baseFolderSources: [], // Stable, read-only folder baseline from the private spreadsheet.
    libraryRoots: [], // Verified Drive root folders, never hard-coded.
    lastDiscoveryAt: null,
    lastFallbackScanAt: null,
    discoveryError: null,
    syncedFolders: new Map(), // Live metadata held in memory for this session only.
    health: new Map(),
    lastScanAt: null,
    scanning: false,
    scanTimer: null,
    scanDelayTimer: null,
    scanController: null,
    scanGeneration: 0,
    scanFailures: new Map(),
    syncErrorVisible: false,
    changeToken: null,
    driveIdentity: null,
    lastFullScanAt: null,
    videoObjectUrl: null,
    videoController: null,
    playingMediaId: null,
    posterController: null,
    posterWorkingId: null,
    posterError: new Map(),
    videoLibraryFilter: 'all',
    videoLibraryPage: 1,
    videoSessionEvidence: new Map(),
    storyboardController: null,
    storyboardWorkingId: null,
    storyboardFrames: [],
  };
  const safeId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(id);
  const format = n => Number(n || 0).toLocaleString('en-US');
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const folderName = folder => String(folder || '').split('/').slice(-1)[0];
  const folderKind = folder => String(folder || '')==='Memes'||String(folder || '').startsWith('Memes/') ? 'memes' : 'photos';
  const folderStyle = folder => {
    const text = folder.toLowerCase();
    if (text.includes('pepe')) return {kind:'pepe',icon:'☺'};
    if (text.includes('wojak')) return {kind:'wojak',icon:'◉'};
    if (text.includes('israel')) return {kind:'israel',icon:'☼'};
    if (text.includes('rhinebeck')) return {kind:'rhinebeck',icon:'✈'};
    return {kind:'generic',icon:'✦'};
  };
  const mediaKind = item => item.mime?.startsWith('video/') ? 'video' : item.mime === 'application/pdf' ? 'pdf' : 'image';
  const supportedMedia = mime => mime?.startsWith('image/') || mime?.startsWith('video/') || mime === 'application/pdf';
  /* GENERATED MEDIA CONTRACT START */
  const mediaContract = (() => {
    const MEDIA_RECORD_SCHEMA_VERSION = 1;
    const MEDIA_EVIDENCE_LEVELS = Object.freeze([
      'unverified', 'still-image', 'poster-only', 'sampled-frames', 'full-video'
    ]);
    
    function mediaContractText(value) {
      return typeof value === 'string' ? value : '';
    }
    
    function mediaContractEvidence(record) {
      const status = mediaContractText(record.review).toLowerCase();
      const method = mediaContractText(record.analysisMethod).toLowerCase();
      const mime = mediaContractText(record.mime).toLowerCase();
      const explicitlyUnverified = record.newInDrive ||
        /(?:needs review|not reviewed|unreviewed|awaiting review|pending review|^review blocked|not visually inspected|sensitive non-meme pdf)/.test(status) ||
        /not visually (?:verified|reviewed|inspected)/.test(status);
      const visualStatus = /(?:visually verified|visually reviewed|visually inspected|visual review:|video preview (?:frame inspected|reviewed)|renamed.*verified|reviewed by|review complete|verified by|approved|^verified\b|^reviewed\b|direct original drive still(?:[- ]image)? (?:verification|visual verification|inspected|verified)|animated gif checked against original)/.test(status);
      const visualMethod = /(?:actual pixels inspected|actual pixels;|original image .*visually inspected|original image pixels inspected|original image inspected|direct inspection of original pixels|original drive video sampled|preview frames decoded|original drive mp4 previewed|chatgpt visual inspection|sampled animation frames)/.test(method);
      let level = 'unverified';
      if (!explicitlyUnverified && mediaContractText(record.description).trim()) {
        if (mime.startsWith('video/')) {
          if (/\b(full[ -]motion|entire video|full video) (?:visually )?(?:reviewed|verified|inspected)\b/.test(status))
            level = 'full-video';
          else if (/(?:video preview|sampled frames|preview frames)/.test(status + ' ' + method))
            level = /(?:poster[- ]only|single.{0,45}(?:poster|thumbnail)|poster thumbnail)/.test(status + ' ' + method)
              ? 'poster-only' : 'sampled-frames';
        } else if (mime.startsWith('image/') && (visualStatus || visualMethod)) {
          level = 'still-image';
        }
      }
      return {level, source:record.newInDrive?'drive':'manifest',
        detail:mediaContractText(record.review),
        analysisMethod:mediaContractText(record.analysisMethod)};
    }
    
    function mediaContractDateEvidence(record) {
      // Search Index!H is mapped to Manifest!P (original EXIF capture value).
      // Manifest!J is separately filename-derived; never relabel it as EXIF.
      const captureDate = mediaContractText(record.captureDate).trim();
      const filenameDate = mediaContractText(record.filenameDate).trim();
      const filenameBasis = mediaContractText(record.filenameDateEvidence);
      if (captureDate) return {value:captureDate,source:'exif',basis:'Manifest!P'};
      if (filenameDate) return {value:filenameDate,source:'filename',basis:filenameBasis||'Manifest!J'};
      return {value:'',source:'unknown',basis:''};
    }
    
    function normalizeMediaRecord(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record))
        throw new TypeError('Media record must be an object');
      const safeSize = Number(record.size);
      const normalized = {
        ...record,
        schemaVersion:MEDIA_RECORD_SCHEMA_VERSION,
        id:mediaContractText(record.id),
        folder:mediaContractText(record.folder),
        name:mediaContractText(record.name),
        collection:mediaContractText(record.collection),
        description:mediaContractText(record.description),
        tags:mediaContractText(record.tags),
        review:mediaContractText(record.review),
        analysisMethod:mediaContractText(record.analysisMethod),
        captureDate:mediaContractText(record.captureDate),
        filenameDate:mediaContractText(record.filenameDate),
        filenameDateEvidence:mediaContractText(record.filenameDateEvidence),
        mime:mediaContractText(record.mime),
        size:Number.isFinite(safeSize)&&safeSize>=0?safeSize:0
      };
      // Descriptive evidence is not authorization to edit Drive or Sheet data.
      normalized.provenance = {
        visual: mediaContractEvidence(normalized),
        date: mediaContractDateEvidence(normalized)
      };
      return normalized;
    }
    return {MEDIA_RECORD_SCHEMA_VERSION,MEDIA_EVIDENCE_LEVELS,
      mediaContractEvidence,mediaContractDateEvidence,normalizeMediaRecord};
  })();
  /* GENERATED MEDIA CONTRACT END */
  /* GENERATED SEARCH ENGINE START */
  const searchEngine=(()=>{
    const SEARCH_ENGINE_VERSION=1;
    const SEARCH_MAX_QUERY=300;
    const SEARCH_FILTER_NAMES=new Set(['tag','folder','type','before','after','review','favorite']);
    
    function searchNormalize(value){
      return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'')
        .toLocaleLowerCase().replace(/\s+/gu,' ').trim();
    }
    function searchTokens(input){
      const result=[];let current='',quoted=false;
      for(const ch of String(input??'').slice(0,SEARCH_MAX_QUERY)){
        if(ch==='"'){quoted=!quoted;continue;}
        if(/\s/u.test(ch)&&!quoted){
          if(current){result.push(current);current='';}
        }else current+=ch;
      }
      if(current)result.push(current);
      return result;
    }
    function searchValidDay(input){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(input))return false;
      const date=new Date(input+'T00:00:00Z');
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===input;
    }
    function parseSearchQuery(input){
      const raw=String(input??'').slice(0,SEARCH_MAX_QUERY);
      const parsed={raw,terms:[],filters:[],errors:[]};
      for(const token of searchTokens(raw)){
        const colon=token.indexOf(':');
        const field=colon>0?token.slice(0,colon).toLowerCase():'';
        const value=colon>0?token.slice(colon+1):'';
        if(!SEARCH_FILTER_NAMES.has(field)){const word=searchNormalize(token);if(word)parsed.terms.push(word);continue;}
        const word=searchNormalize(value);
        if(!word){parsed.errors.push('Missing value for '+field+':');continue;}
        if((field==='after'||field==='before')&&!searchValidDay(word)){
          parsed.errors.push(field+': requires a real YYYY-MM-DD date');continue;
        }
        if(field==='type'&&!['image','gif','video','pdf'].includes(word)){
          parsed.errors.push('type: must be image, gif, video or pdf');continue;
        }
        if(field==='review'&&!['pending','deferred','reviewed','source-reviewed'].includes(word)){
          parsed.errors.push('review: must be pending, deferred, reviewed or source-reviewed');continue;
        }
        if(field==='favorite'&&!['true','false'].includes(word)){
          parsed.errors.push('favorite: must be true or false');continue;
        }
        parsed.filters.push({field,value:word});
      }
      return parsed;
    }
    function searchKind(item){
      const mime=String(item.mime||'').toLowerCase();
      return mime.startsWith('video/')?'video':mime==='application/pdf'?'pdf':'image';
    }
    function searchDate(item){
      const date=String(item.provenance?.date?.value||item.captureDate||item.filenameDate||'').slice(0,10);
      return searchValidDay(date)?date:'';
    }
    function searchRank(item,query,context={}){
      if(query.errors.length)return null;
      const fields={
        name:searchNormalize(item.name),
        tags:searchNormalize(context.tags??item.tags),
        description:searchNormalize(context.description??item.description),
        folder:searchNormalize(item.folder),
        category:searchNormalize(item.category),
        date:searchNormalize(searchDate(item))
      };
      for(const {field,value} of query.filters){
        if(field==='tag' && !fields.tags.includes(value))return null;
        if(field==='folder' && !fields.folder.includes(value))return null;
        if(field==='type' && (value==='gif'?String(item.mime).toLowerCase()==='image/gif':searchKind(item)===value)===false)return null;
        if(field==='after' && !(searchDate(item) && searchDate(item)>=value))return null;
        if(field==='before' && !(searchDate(item) && searchDate(item)<=value))return null;
        if(field==='review' && context.review!==value)return null;
        if(field==='favorite' && Boolean(context.favorite)!==(value==='true'))return null;
      }
      let score=0;
      for(const word of query.terms){
        let best=0;
        for(const [field,weight] of [['name',110],['tags',80],['description',55],['category',35],['folder',22],['date',12]]){
          const value=fields[field];
          if(!value)continue;
          if(value===word)best=Math.max(best,weight+40);
          else if(value.startsWith(word))best=Math.max(best,weight+18);
          else if(value.includes(word))best=Math.max(best,weight);
        }
        if(best===0)return null; // Terms can match across independent fields.
        score+=best;
      }
      if(query.terms.length){
        const phrase=query.terms.join(' ');
        if(fields.name===phrase)score+=100;
        else if(fields.name.includes(phrase))score+=35;
        else if(fields.tags.includes(phrase))score+=20;
      }
      return score;
    }
    function searchMedia(items,parsed,contextForItem=()=>({})){
      const output=[];
      for(const item of items){
        const rank=searchRank(item,parsed,contextForItem(item));
        if(rank!==null)output.push({item,rank});
      }
      output.sort((a,b)=>b.rank-a.rank||
        String(a.item.name||'').localeCompare(String(b.item.name||''))||
        String(a.item.id||'').localeCompare(String(b.item.id||'')));
      return output;
    }
    return {SEARCH_ENGINE_VERSION,SEARCH_MAX_QUERY,searchNormalize,searchTokens,
      searchValidDay,parseSearchQuery,searchKind,searchDate,searchRank,searchMedia};
  })();
  /* GENERATED SEARCH ENGINE END */
  /* GENERATED SMART COLLECTIONS START */
  const smartEngine=(()=>{
    const SMART_COLLECTIONS_SCHEMA='image-vault-smart-collections-v1';
    const SMART_COLLECTION_LIMIT=40;
    const SMART_RULE_LIMIT=8;
    const SMART_BACKUP_LIMIT=100000;
    const SMART_FIELDS=Object.freeze(['text','name','description','tags','folder','category','dateAfter','dateBefore','type','favorite']);
    const SMART_TYPES=Object.freeze(['image','gif','video','pdf']);
    const SMART_BUILTINS=Object.freeze([
      {id:'builtin-cats',name:'Cats & Animals',mode:'any',rules:[
        {field:'text',value:'cat'},{field:'text',value:'kitten'},{field:'text',value:'animal'}]},
      {id:'builtin-aircraft',name:'Aircraft & Aviation',mode:'any',rules:[
        {field:'text',value:'aircraft'},{field:'text',value:'airplane'},{field:'text',value:'aviation'}]},
      {id:'builtin-travel',name:'Travel & Places',mode:'any',rules:[
        {field:'text',value:'travel'},{field:'text',value:'vacation'},{field:'text',value:'landmark'}]},
      {id:'builtin-reactions',name:'Reaction Memes',mode:'any',rules:[
        {field:'text',value:'reaction'},{field:'text',value:'wojak'},{field:'text',value:'pepe'}]},
      {id:'builtin-gifs',name:'Animated GIFs',mode:'all',rules:[
        {field:'type',value:'gif'}]}
    ]);
    function smartText(value){
      return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'')
        .toLocaleLowerCase().replace(/\s+/gu,' ').trim();
    }
    function smartDate(value){
      const day=String(value??'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';
      const d=new Date(day+'T00:00:00Z');
      return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:'';
    }
    function smartMimeType(mime){
      const type=String(mime??'').toLowerCase();
      if(type==='image/gif')return 'gif';
      if(type.startsWith('image/'))return 'image';
      if(type.startsWith('video/'))return 'video';
      if(type==='application/pdf')return 'pdf';
      return 'other';
    }
    function smartRuleValid(rule){
      if(!rule||typeof rule!=='object'||Array.isArray(rule)||!SMART_FIELDS.includes(rule.field)||
        typeof rule.value!=='string'||!rule.value.trim()||rule.value.length>150)return false;
      const value=smartText(rule.value);
      if(['dateAfter','dateBefore'].includes(rule.field))return smartDate(value)===value;
      if(rule.field==='type')return SMART_TYPES.includes(value);
      if(rule.field==='favorite')return ['true','false'].includes(value);
      return !!value;
    }
    function smartValidateCollection(value,{builtin=false}={}){
      if(!value||typeof value!=='object'||Array.isArray(value)||
        typeof value.id!=='string'||!(builtin?/^builtin-[a-z]+$/.test(value.id):/^c\d{13}_[0-9]{1,4}$/.test(value.id))||
        typeof value.name!=='string'||!value.name.trim()||value.name.length>80||
        !['all','any'].includes(value.mode)||!Array.isArray(value.rules)||
        !value.rules.length||value.rules.length>SMART_RULE_LIMIT||
        !value.rules.every(smartRuleValid))return null;
      if(!builtin && (!Number.isSafeInteger(value.createdAt)||!Number.isSafeInteger(value.updatedAt)||
        value.createdAt<0||value.updatedAt<value.createdAt||
        value.updatedAt>Date.now()+60000))return null;
      return {id:value.id,name:value.name.trim(),mode:value.mode,
        rules:value.rules.map(r=>({field:r.field,value:r.value.trim()})),
        ...(builtin?{builtin:true}:{createdAt:value.createdAt,updatedAt:value.updatedAt})};
    }
    function smartEvaluateRule(record,rule,context={}){
      const value=smartText(rule.value);
      const fields={
        name:smartText(record.name),
        description:smartText(context.description??record.description),
        tags:smartText(context.tags??record.tags),
        folder:smartText(record.folder),
        category:smartText(record.category)
      };
      const text=[fields.name,fields.description,fields.tags,fields.category].join(' ');
      let match=false;
      if(rule.field==='text')match=text.includes(value);
      else if(['name','description','tags','folder','category'].includes(rule.field))
        match=fields[rule.field].includes(value);
      else if(rule.field==='favorite')match=Boolean(context.favorite)===(value==='true');
      else if(rule.field==='type'){
        const type=smartMimeType(record.mime);
        match=type===value||(value==='image'&&type==='gif');
      }else if(['dateAfter','dateBefore'].includes(rule.field)){
        const date=smartDate(record.provenance?.date?.value||record.captureDate||record.filenameDate);
        match=!!date&&(rule.field==='dateAfter'?date>=value:date<=value);
      }
      const label=rule.field==='text'?'Text':rule.field==='dateAfter'?'Date on/after':
        rule.field==='dateBefore'?'Date on/before':
        rule.field==='favorite'?'Favorite':rule.field==='type'?'Media type':
        rule.field.charAt(0).toUpperCase()+rule.field.slice(1);
      return {matched:match,reason:label+': '+rule.value};
    }
    function smartMatch(record,collection,context={}){
      if(!collection||!Array.isArray(collection.rules)||!collection.rules.length)
        return {matched:false,reasons:[]};
      const checks=collection.rules.map(rule=>smartEvaluateRule(record,rule,context));
      const matched=collection.mode==='all'?checks.every(x=>x.matched):checks.some(x=>x.matched);
      return {matched,reasons:matched?checks.filter(x=>x.matched).map(x=>x.reason):[]};
    }
    function smartMembers(records,collection,contextFor=()=>({})){
      const seen=new Set(),members=[];
      for(const record of records){
        if(!record||typeof record.id!=='string'||seen.has(record.id))continue;
        seen.add(record.id);
        const result=smartMatch(record,collection,contextFor(record));
        if(result.matched)members.push({id:record.id,item:record,reasons:result.reasons});
      }
      return members;
    }
    function smartExplain(collection){
      if(!collection||!Array.isArray(collection.rules))return '';
      return collection.rules.map(r=>smartEvaluateRule({},r).reason)
        .join(collection.mode==='all'?' AND ':' OR ');
    }
    function smartParseBackup(raw){
      if(typeof raw!=='string'||raw.length>SMART_BACKUP_LIMIT)
        throw new Error('Collection backup exceeds 100 KB');
      let value;
      try{value=JSON.parse(raw);}catch{throw new Error('Collection backup is not JSON');}
      if(!value||value.schema!==SMART_COLLECTIONS_SCHEMA||!Array.isArray(value.collections)||
        value.collections.length>SMART_COLLECTION_LIMIT)
        throw new Error('Invalid Smart Collections backup format');
      const records=[],ids=new Set(),names=new Set();
      for(const item of value.collections){
        const parsed=smartValidateCollection(item);
        if(!parsed||ids.has(parsed.id)||names.has(smartText(parsed.name)))
          throw new Error('Invalid, duplicate, or conflicting Smart Collection');
        ids.add(parsed.id);names.add(smartText(parsed.name));records.push(parsed);
      }
      return records;
    }
    function smartExportBackup(collections){
      if(!Array.isArray(collections)||collections.length>SMART_COLLECTION_LIMIT)
        throw new Error('Too many Smart Collections to export');
      const raw=JSON.stringify({schema:SMART_COLLECTIONS_SCHEMA,collections});
      smartParseBackup(raw);
      return raw;
    }
    return {SMART_COLLECTIONS_SCHEMA,SMART_COLLECTION_LIMIT,SMART_RULE_LIMIT,
      SMART_BACKUP_LIMIT,SMART_FIELDS,SMART_TYPES,SMART_BUILTINS,smartText,smartDate,
      smartMimeType,smartRuleValid,smartValidateCollection,smartEvaluateRule,
      smartMatch,smartMembers,smartExplain,smartParseBackup,smartExportBackup};
  })();
  /* GENERATED SMART COLLECTIONS END */
  /* GENERATED MEMORY LANE START */
  const memoryEngine=(()=>{
    const MEMORY_LANE_SCHEMA=1;
    const MEMORY_SOURCES=Object.freeze(['exif','filename','drive-upload','unknown']);
    const MEMORY_SOURCE_LABELS=Object.freeze({
      exif:'EXIF camera date',filename:'Filename-derived date',
      'drive-upload':'Drive added (local date)',unknown:'Date unknown'
    });
    function memoryValidDay(input){
      const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input||''));
      if(!match)return '';
      const y=+match[1],m=+match[2],d=+match[3];
      if(y<1900||y>2100||m<1||m>12||d<1||d>31)return '';
      const dt=new Date(Date.UTC(y,m-1,d));
      return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?
        match[0]:'';
    }
    function memoryCaptureDay(value){
      const m=/^(\d{4})[-:/](\d{2})[-:/](\d{2})(?=$|[ T])/.
        exec(typeof value==='string'?value.trim():'');
      return m?memoryValidDay(m[1]+'-'+m[2]+'-'+m[3]):'';
    }
    function memoryLocalDriveDay(value){
      if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
        return '';
      const parsed=new Date(value);
      if(!Number.isFinite(parsed.getTime()))return '';
      const day=[parsed.getFullYear(),String(parsed.getMonth()+1).padStart(2,'0'),
        String(parsed.getDate()).padStart(2,'0')].join('-');
      return memoryValidDay(day);
    }
    function memoryEvidence(record){
      if(!record||typeof record!=='object')return {day:'',source:'unknown',label:MEMORY_SOURCE_LABELS.unknown,basis:''};
      // Camera and filename calendar dates are intentionally NOT timezone-shifted.
      const exif=memoryCaptureDay(record.exifCapture||record.captureDate);
      if(exif)return {day:exif,source:'exif',label:MEMORY_SOURCE_LABELS.exif,
        basis:record.provenance?.date?.source==='exif'?
          (record.provenance.date.basis||'Manifest!P'):'Manifest!P'};
      const filename=memoryCaptureDay(record.filenameDate);
      if(filename)return {day:filename,source:'filename',label:MEMORY_SOURCE_LABELS.filename,
        basis:record.filenameDateEvidence||'Manifest!J'};
      // Drive creation is an instant, and is converted to the viewing device's
      // local calendar day. It is never presented as the moment a photo was taken.
      const created=memoryLocalDriveDay(record.driveCreatedAt);
      if(created)return {day:created,source:'drive-upload',label:MEMORY_SOURCE_LABELS['drive-upload'],
        basis:'Manifest!H · '+record.driveCreatedAt};
      return {day:'',source:'unknown',label:MEMORY_SOURCE_LABELS.unknown,basis:''};
    }
    function memoryDedupe(items){
      const seen=new Set(),unique=[];
      for(const item of items||[]){
        if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id))continue;
        seen.add(item.id);unique.push(item);
      }
      return unique;
    }
    function memoryMatches(item,selection={},now=new Date()){
      const e=memoryEvidence(item),source=selection.source||'all',key=selection.key||'all';
      if(source!=='all'&&e.source!==source)return false;
      if(key==='all')return true;
      if(key==='unknown')return e.source==='unknown';
      if(key==='today'){
        if(!['exif','filename'].includes(e.source)||!e.day||!Number.isFinite(now.getTime()))return false;
        const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
          String(now.getDate()).padStart(2,'0')].join('-');
        return +e.day.slice(0,4)<now.getFullYear()&&e.day.slice(5)===today.slice(5);
      }
      if(/^\d{4}-\d{2}$/.test(key))return e.day.startsWith(key+'-');
      return false;
    }
    function memoryBuildTimeline(records,{year='all',source='all',now=new Date()}={}){
      const items=memoryDedupe(records);
      const allYears=new Set(),sourceCounts={exif:0,filename:0,'drive-upload':0,unknown:0};
      const groups=new Map(),unknown=[],today=[];
      for(const item of items){
        const evidence=memoryEvidence(item);
        sourceCounts[evidence.source]++;
        if(evidence.day)allYears.add(evidence.day.slice(0,4));
        if(memoryMatches(item,{key:'today',source},now))today.push({item,evidence});
        if(source!=='all'&&evidence.source!==source)continue;
        if(year!=='all'&&(evidence.day?evidence.day.slice(0,4):'unknown')!==year)continue;
        if(!evidence.day){unknown.push({item,evidence});continue;}
        const key=evidence.day.slice(0,7);
        if(!groups.has(key))groups.set(key,{key,year:key.slice(0,4),month:key.slice(5),
          count:0,sources:{exif:0,filename:0,'drive-upload':0},sample:[]});
        const group=groups.get(key);group.count++;group.sources[evidence.source]++;
        if(group.sample.length<3)group.sample.push({name:item.name||'Untitled media',id:item.id});
      }
      return {
        schema:MEMORY_LANE_SCHEMA,
        years:[...allYears].sort((a,b)=>b.localeCompare(a)),
        sourceCounts,
        months:[...groups.values()].sort((a,b)=>b.key.localeCompare(a.key)),
        unknownCount:unknown.length,
        onThisDay:today.sort((a,b)=>b.evidence.day.localeCompare(a.evidence.day)),
        total:items.length
      };
    }
    function memoryMonthLabel(key){
      const m=/^(\d{4})-(\d{2})$/.exec(key||'');
      if(!m||!memoryValidDay(key+'-01'))return 'Unknown month';
      return new Date(Date.UTC(+m[1],+m[2]-1,1)).
        toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
    }
    return {MEMORY_LANE_SCHEMA,MEMORY_SOURCES,MEMORY_SOURCE_LABELS,
      memoryValidDay,memoryCaptureDay,memoryLocalDriveDay,memoryEvidence,
      memoryDedupe,memoryMatches,memoryBuildTimeline,memoryMonthLabel};
  })();
  /* GENERATED MEMORY LANE END */
  /* GENERATED VIDEO LIBRARY START */
  const videoLibrary=(()=>{
    const VIDEO_LIBRARY_SCHEMA=1;
    const VIDEO_STORYBOARD_MAX=12*1024*1024;
    const VIDEO_PLAYBACK_MAX=32*1024*1024;
    const VIDEO_STORYBOARD_FRAMES=3;
    const VIDEO_MAX_DIMENSION=3840;
    const VIDEO_MAX_PIXELS=16000000;
    const VIDEO_CATALOG_PAGE=36;
    const VIDEO_EVIDENCE=Object.freeze(['unverified','poster-only','sampled-frames','full-video']);
    function videoMime(item){
      return String(typeof item==='string'?item:item?.mime||'').split(';')[0].toLowerCase().trim();
    }
    function videoFormat(item){
      const mime=videoMime(item);
      return mime==='video/mp4'?'MP4':mime==='video/webm'?'WebM':'Unsupported';
    }
    function videoEligibility(item,{operation='storyboard',canPlay=true}={}){
      const size=Number(item?.size),format=videoFormat(item);
      const limit=operation==='playback'?VIDEO_PLAYBACK_MAX:VIDEO_STORYBOARD_MAX;
      if(format==='Unsupported')return {allowed:false,reason:'This video format is not supported by the in-app player. Open in Drive.',limit};
      if(!Number.isSafeInteger(size)||size<=0)return {allowed:false,reason:'Video size is unknown. Open in Drive rather than downloading without a safe limit.',limit};
      if(size>limit)return {allowed:false,reason:'This video exceeds the '+(limit/1048576)+' MB in-app '+(operation==='playback'?'playback':'storyboard')+' limit. Open in Drive.',limit};
      if(!canPlay)return {allowed:false,reason:'This browser does not support the reported video codec. Open in Drive.',limit};
      return {allowed:true,reason:'',limit};
    }
    function videoValidateSignature(bytes,item){
      const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
      const format=videoFormat(item);
      if(format==='MP4'){
        return data.length>=12 &&
          data[4]===0x66&&data[5]===0x74&&data[6]===0x79&&data[7]===0x70;
      }
      if(format==='WebM'){
        return data.length>=8 &&
          data[0]===0x1a&&data[1]===0x45&&data[2]===0xdf&&data[3]===0xa3;
      }
      return false;
    }
    function videoStoryboardTimes(duration){
      const n=Number(duration);
      if(!Number.isFinite(n)||n<=0||n>12*60*60)throw new Error('Invalid or unavailable video duration');
      // Avoid sampling frame zero, which is frequently a black thumbnail.
      const positions=[0.15,0.5,0.85].map(p=>Math.max(0,Math.min(n-0.04,n*p)));
      return positions.map(x=>Number(x.toFixed(3)));
    }
    function videoEvidence(item,session={}){
      const manifest=String(item?.provenance?.visual?.level||'').toLowerCase();
      const valid=VIDEO_EVIDENCE.includes(manifest)?manifest:'unverified';
      const frameCount=Number.isSafeInteger(session.sampledFrames)?session.sampledFrames:0;
      const local=frameCount>=VIDEO_STORYBOARD_FRAMES?'sampled-frames':
        session.poster===true?'poster-only':'unverified';
      const order=VIDEO_EVIDENCE;
      const level=order.indexOf(valid)>=order.indexOf(local)?valid:local;
      const origin=order.indexOf(valid)>=order.indexOf(local)&&valid!=='unverified'?'manifest':
        local!=='unverified'?'session':'none';
      const titles={
        unverified:'Visual review not verified',
        'poster-only':'Still poster only',
        'sampled-frames':'Sampled video frames',
        'full-video':'Full video visual review documented in Manifest'
      };
      return {level,origin,label:titles[level],
        playback:session.playbackEnded===true?
          'Playback reached the end during this session, not a content review':
          'Playback completion not established',
        audio:'Audio not reviewed. A poster, storyboard, or playback event does not verify audio.'};
    }
    function videoList(records,{filter='all',page=1}={}){
      const seen=new Set(),list=[];
      for(const item of Array.isArray(records)?records:[]){
        if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||!videoMime(item).startsWith('video/'))continue;
        seen.add(item.id);
        const evidence=videoEvidence(item).level;
        if(filter==='unverified'&&evidence!=='unverified')continue;
        if(filter==='reviewed'&&evidence==='unverified')continue;
        if(filter==='oversized'&&videoEligibility(item,{operation:'storyboard'}).allowed)continue;
        list.push(item);
      }
      list.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))||a.id.localeCompare(b.id));
      const totalPages=Math.max(1,Math.ceil(list.length/VIDEO_CATALOG_PAGE));
      const current=Math.max(1,Math.min(totalPages,Math.floor(Number(page)||1)));
      return {total:list.length,page:current,pageCount:Math.max(1,Math.ceil(list.length/VIDEO_CATALOG_PAGE)),
        entries:list.slice((current-1)*VIDEO_CATALOG_PAGE,current*VIDEO_CATALOG_PAGE)};
    }
    return {VIDEO_LIBRARY_SCHEMA,VIDEO_STORYBOARD_MAX,VIDEO_PLAYBACK_MAX,
      VIDEO_STORYBOARD_FRAMES,VIDEO_MAX_DIMENSION,VIDEO_MAX_PIXELS,VIDEO_CATALOG_PAGE,
      VIDEO_EVIDENCE,videoMime,videoFormat,videoEligibility,videoValidateSignature,
      videoStoryboardTimes,videoEvidence,videoList};
  })();
  /* GENERATED VIDEO LIBRARY END */
  const humanBytes = n => n ? `${(n / 1024 / 1024).toFixed(1)} MB` : 'Unknown size';
  const SCAN_INTERVAL = 15 * 60 * 1000;
  const FULL_SCAN_INTERVAL = 24 * 60 * 60 * 1000;
  const MAX_AMBIGUOUS_LOOKUPS = 25;
  const MAX_DISCOVERED_FOLDERS = 300;
  const MAX_DISCOVERY_DEPTH = 8;
  const MAX_DISCOVERED_MEDIA = 20000;
  const MAX_VIDEO_PREVIEW = 32 * 1024 * 1024;
  const MAX_GIF_PREVIEW = 20 * 1024 * 1024;
  const MAX_POSTER_VIDEO = 12 * 1024 * 1024;
  const isGIF = item => (item?.mime||'').toLowerCase()==='image/gif';
  const linkToDrive = item => safeId(item?.id) ? `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view` : '';
  function readSettings() {
    try {const p = JSON.parse(localStorage.getItem(SHELL_STORAGE) || '{}'); return {clientId:p.clientId || '', sheetId:p.sheetId || ''};}
    catch {return {clientId:'',sheetId:''};}
  }
  function readUpdateRepo() {try {return localStorage.getItem(REPO_STORAGE) || '';} catch {return '';}}
  function readDensity() {
    try{const value=localStorage.getItem(DENSITY_STORAGE);return ['comfortable','compact','large'].includes(value)?value:'comfortable';}
    catch{return 'comfortable';}
  }
  function readPreferences() {
    try{
      const raw=JSON.parse(localStorage.getItem(APP_PREFS_STORAGE)||'{}');
      return {autoLoad:typeof raw.autoLoad==='boolean'?raw.autoLoad:true,
        batchSize:[16,32,48].includes(raw.batchSize)?raw.batchSize:32,
        rememberBrowsing:typeof raw.rememberBrowsing==='boolean'?raw.rememberBrowsing:true};
    }catch{return {autoLoad:true,batchSize:32,rememberBrowsing:true};}
  }
  function showPreferences(){
    $('prefAutoLoad').checked=state.autoLoad;
    $('prefBatchSize').value=String(state.pageSize);
    $('prefDensity').value=state.density;
    $('prefRememberBrowsing').checked=state.rememberBrowsing;
    $('preferencesDialog').showModal();
  }
  function savePreferences(event){
    event.preventDefault();
    const autoLoad=$('prefAutoLoad').checked;
    const batchSize=Number($('prefBatchSize').value);
    const density=$('prefDensity').value;
    const rememberBrowsing=$('prefRememberBrowsing').checked;
    if(![16,32,48].includes(batchSize)||!['compact','comfortable','large'].includes(density))return;
    const shown=state.renderedCount;
    state.autoLoad=autoLoad;
    state.pageSize=batchSize;
    state.density=density;
    state.rememberBrowsing=rememberBrowsing;
    if(!rememberBrowsing)clearBrowsingPosition();
    state.page=Math.max(1,Math.ceil(shown/batchSize));
    try{
      localStorage.setItem(APP_PREFS_STORAGE,JSON.stringify({autoLoad,batchSize,rememberBrowsing}));
      localStorage.setItem(DENSITY_STORAGE,density);
    }catch{alertUser('App preferences could not be saved to this device. They will apply for this session.', 'error');}
    $('preferencesDialog').close();
    if(state.view!=='home'&&state.view!=='health'){
      renderGallery();
      if(rememberBrowsing)scheduleBrowseSave();
    }
  }
  function clearBrowsingPosition(){
    if(state.browseSaveTimer)clearTimeout(state.browseSaveTimer);
    state.browseSaveTimer=null;
    try{localStorage.removeItem(BROWSE_STORAGE);}catch{}
  }
  function browsingView(){return ['all','memes','photos','favorites','review','smart','smart-results','memory','memory-results'].includes(state.view);}
  function saveBrowsingPosition(){
    if(state.browseSaveTimer)clearTimeout(state.browseSaveTimer);
    state.browseSaveTimer=null;
    if(!state.connected||!state.rememberBrowsing||!state.driveIdentity||!browsingView())return;
    const position={
      schema:1,account:state.driveIdentity,sheetId:state.config.sheetId,savedAt:Date.now(),
      view:state.view,smartCollectionId:state.smartCollectionId,
      memoryYear:state.memoryYear,memorySource:state.memorySource,memorySelection:state.memorySelection,
      folder:state.folder,search:state.search.slice(0,200),
      sort:state.sort,mediaType:state.mediaType,layout:state.layout,
      page:Math.max(1,Math.min(20,state.page)),
      scrollY:Math.max(0,Math.min(100000,Math.floor(window.scrollY||window.pageYOffset||0)))
    };
    try{localStorage.setItem(BROWSE_STORAGE,JSON.stringify(position));}catch{}
  }
  function scheduleBrowseSave(){
    if(!state.connected||!state.rememberBrowsing||!browsingView())return;
    if(state.browseSaveTimer)clearTimeout(state.browseSaveTimer);
    state.browseSaveTimer=setTimeout(saveBrowsingPosition,350);
  }
  function restoreBrowsingPosition(){
    if(!state.rememberBrowsing||!state.driveIdentity)return false;
    let saved;
    try{saved=JSON.parse(localStorage.getItem(BROWSE_STORAGE)||'null');}catch{return false;}
    if(!saved||saved.schema!==1||saved.account!==state.driveIdentity||
       saved.sheetId!==state.config.sheetId||!['all','memes','photos','favorites','review','smart','smart-results','memory','memory-results'].includes(saved.view)||
       !Number.isFinite(saved.savedAt)||saved.savedAt>Date.now()+60000||
       Date.now()-saved.savedAt>30*24*60*60*1000)return false;
    state.smartCollectionId=typeof saved.smartCollectionId==='string'&&allSmartCollections().some(x=>x.id===saved.smartCollectionId)?saved.smartCollectionId:'';
    state.memoryYear=typeof saved.memoryYear==='string'&&/^(all|\d{4})$/.test(saved.memoryYear)?saved.memoryYear:'all';
    state.memorySource=['all',...memoryEngine.MEMORY_SOURCES].includes(saved.memorySource)?saved.memorySource:'all';
    const savedKey=saved.memorySelection?.key;
    state.memorySelection={key:typeof savedKey==='string'&&/^(today|unknown|\d{4}-\d{2})$/.test(savedKey)?savedKey:'all',
      source:['all',...memoryEngine.MEMORY_SOURCES].includes(saved.memorySelection?.source)?saved.memorySelection.source:'all'};
    state.view=saved.view==='smart-results'&&!state.smartCollectionId?'smart':
      saved.view==='memory-results'&&state.memorySelection.key==='all'?'memory':saved.view;
    state.folder=typeof saved.folder==='string'&&(saved.folder==='all'||state.folders.some(f=>f.path===saved.folder))?saved.folder:'all';
    state.search=typeof saved.search==='string'?saved.search.slice(0,200):'';
    state.sort=['name','date-desc','date-asc','review'].includes(saved.sort)?saved.sort:'name';
    state.mediaType=['all','image','video','pdf'].includes(saved.mediaType)?saved.mediaType:'all';
    state.layout=['grid','list'].includes(saved.layout)?saved.layout:'grid';
    state.page=Number.isInteger(saved.page)?Math.max(1,Math.min(20,saved.page)):1;
    state.resumeScrollY=Number.isFinite(saved.scrollY)?Math.max(0,Math.min(100000,saved.scrollY)):0;
    $('searchInput').value=state.search;
    $('sortSelect').value=state.sort;
    $('mediaTypeSelect').value=state.mediaType;
    return true;
  }
  function finishBrowsingRestore(){
    if(state.resumeScrollY===null)return;
    const y=state.resumeScrollY;
    state.resumeScrollY=null;
    setTimeout(()=>window.scrollTo({top:y,behavior:'instant'}),80);
  }
  function updateScrollControls(){
    const active=state.connected&&browsingView()&&(window.scrollY||window.pageYOffset||0)>650;
    $('backToTop').classList.toggle('hidden',!active);
  }

  function reviewStorageKey(){
    if(!state.driveIdentity||!state.config.sheetId)return '';
    return REVIEW_STORAGE+'-'+state.driveIdentity+'-'+state.config.sheetId;
  }
  function validateReviewEntry(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const description=value.description, tags=value.tags, status=value.status;
    if(typeof description!=='string'||description.length>2000||
       typeof tags!=='string'||tags.length>400||
       !['draft','deferred','reviewed'].includes(status))return null;
    if(status==='reviewed'&&!description.trim())return null;
    if(!Number.isFinite(value.updatedAt)||value.updatedAt<0||value.updatedAt>Date.now()+60000)return null;
    return {description,tags,status,updatedAt:value.updatedAt};
  }
  function parseReviewBackup(raw){
    if(typeof raw!=='string'||raw.length>MAX_REVIEW_BYTES)throw new Error('Review backup is too large.');
    let data;
    try{data=JSON.parse(raw);}catch{throw new Error('Review backup is not valid JSON.');}
    if(!data||data.schema!==1||data.account!==state.driveIdentity||
       data.sheetId!==state.config.sheetId||!Array.isArray(data.items)||
       data.items.length>MAX_REVIEW_ITEMS)throw new Error('This review backup is not for the current Drive account and inventory.');
    const next=new Map();
    for(const pair of data.items){
      if(!Array.isArray(pair)||pair.length!==2||!safeId(pair[0])||next.has(pair[0]))
        throw new Error('Review backup contains invalid or duplicate file identifiers.');
      const validated=validateReviewEntry(pair[1]);
      if(!validated)throw new Error('Review backup contains an invalid review record.');
      next.set(pair[0],validated);
    }
    return next;
  }
  function reviewPayload(map){
    return JSON.stringify({schema:1,account:state.driveIdentity,
      sheetId:state.config.sheetId,exportedAt:new Date().toISOString(),items:[...map]});
  }
  function loadReviewNotes(){
    state.reviewEdits=new Map();
    const key=reviewStorageKey();
    if(!key)return;
    try{
      const raw=localStorage.getItem(key);
      if(raw)state.reviewEdits=parseReviewBackup(raw);
      return null;
    }catch(error){
      return 'Saved reviews could not be read: '+error.message+'. Review storage was left unchanged.';
    }
  }
  function writeReviewNotes(next){
    const key=reviewStorageKey();
    if(!key)throw new Error('Connect to Google Drive before saving reviews.');
    const payload=reviewPayload(next);
    if(next.size>MAX_REVIEW_ITEMS||payload.length>MAX_REVIEW_BYTES)
      throw new Error('Review storage is full. Export a backup before making further changes.');
    try{localStorage.setItem(key,payload);}
    catch{throw new Error('Browser storage is unavailable or full. Export your review backup.');}
    state.reviewEdits=next;
  }
  function effectiveDescription(item){
    const note=state.reviewEdits.get(item.id);
    return note?note.description:item.description||'';
  }
  function effectiveTags(item){
    const note=state.reviewEdits.get(item.id);
    return note?note.tags:item.tags||'';
  }
  function reviewStage(item){
    const note=state.reviewEdits.get(item.id);
    if(note?.status==='reviewed'&&effectiveDescription(item).trim())return 'reviewed';
    if(note?.status==='deferred')return 'deferred';
    if(note?.status==='draft')return 'pending';
    const status=String(item.review||'').toLowerCase();
    const method=String(item.analysisMethod||'').toLowerCase();
    // A description, EXIF date or filename alone is not proof of inspection.
    if(!effectiveDescription(item).trim()||item.newInDrive||
       /(?:needs review|not reviewed|unreviewed|awaiting review|pending review)/.test(status)||
       /(?:^review blocked|not visually inspected|sensitive non-meme pdf)/.test(status)||
       /not visually (?:verified|reviewed|inspected)/.test(status))
      return 'pending';
    const statusVisual=/(?:visually verified|visually reviewed|visually inspected|visual review:|video preview (?:frame inspected|reviewed)|renamed.*verified|reviewed by|review complete|verified by|approved|^verified\b|^reviewed\b|direct original drive still(?:[- ]image)? (?:verification|visual verification|inspected|verified)|animated gif checked against original)/.test(status);
    // A missing EXIF capture date is not a missing visual review.
    // Manifest column AC supplies independent image/preview evidence.
    const methodVisual=/(?:actual pixels inspected|actual pixels;|original image .*visually inspected|original image pixels inspected|original image inspected|direct inspection of original pixels|original drive video sampled|preview frames decoded|original drive mp4 previewed|chatgpt visual inspection|sampled animation frames)/.test(method);
    return statusVisual||methodVisual?'source-reviewed':'pending';
  }
  function reviewCounts(){
    const counts={pending:0,deferred:0,reviewed:0,'source-reviewed':0};
    for(const item of state.images){
      if(!item.demo)counts[reviewStage(item)]++;
    }
    return counts;
  }
  function updateReviewCounts(){
    const counts=reviewCounts();
    $('reviewCount').textContent=state.connected?format(counts.pending+counts.deferred):'—';
    return counts;
  }
  function refreshReviewPresentation(){
    updateReviewCounts();
    if(state.view==='home')renderHome();
    else if(state.view!=='health')renderGallery();
  }
  function saveCurrentReview(status,{advance=false}={}){
    const item=state.activeImage;
    if(!item||!state.connected||item.demo)return false;
    const description=$('reviewDescription').value.trim();
    const tags=$('reviewTags').value.trim();
    if(status==='reviewed'&&!description){
      $('reviewEditorStatus').textContent='Add a description before marking this item reviewed.';
      $('reviewDescription').focus();
      return false;
    }
    const nextItem=advance?nextReviewItem(item.id):null;
    const next=new Map(state.reviewEdits);
    next.set(item.id,{description,tags,status,updatedAt:Date.now()});
    try{writeReviewNotes(next);}
    catch(error){$('reviewEditorStatus').textContent=error.message;return false;}
    state.reviewDirty=false;
    $('reviewEditorStatus').textContent=status==='reviewed'?'Reviewed and saved on this device.':
      status==='deferred'?'Moved to Review later.':'Draft saved on this device.';
    refreshReviewPresentation();
    if(advance&&nextItem){
      const fresh=state.images.find(x=>x.id===nextItem.id);
      if(fresh)openImage(fresh.id);
    }else if(advance&&state.view==='review'){
      // Keep the current image visible with its saved status when the queue is empty.
      populateImageDialog();
    }else populateImageDialog();
    return true;
  }
  function nextReviewItem(id){
    if(state.view!=='review')return null;
    const queue=filterImages();
    const index=queue.findIndex(item=>item.id===id);
    return queue[index+1]||queue.find(item=>item.id!==id)||null;
  }
  function resetCurrentReview(){
    const item=state.activeImage;
    if(!item||!state.reviewEdits.has(item.id))return;
    const next=new Map(state.reviewEdits);next.delete(item.id);
    try{writeReviewNotes(next);}
    catch(error){$('reviewEditorStatus').textContent=error.message;return;}
    state.reviewDirty=false;
    refreshReviewPresentation();
    populateImageDialog();
    $('reviewEditorStatus').textContent='Local correction cleared. Original inventory data restored.';
  }
  function exportReviewBackup(){
    if(!state.connected||!reviewStorageKey())return;
    const json=reviewPayload(state.reviewEdits);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;link.download='image-vault-reviews-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }

  function parseChatGPTReviewBatch(raw){
    if(typeof raw!=='string'||raw.length>MAX_REVIEW_BYTES)
      throw new Error('Review batch exceeds local size limit.');
    let data;
    try{data=JSON.parse(raw);}catch{throw new Error('Review batch is not valid JSON.');}
    if(!data||data.schema!=='image-vault-review-batch-v1'||!Array.isArray(data.items)||
       !data.items.length||data.items.length>500)
      throw new Error('Expected a review batch containing 1–500 visual reviews.');
    const updates=new Map();
    for(const record of data.items){
      if(!record||!safeId(record.fileId)||typeof record.filename!=='string'||
         record.filename.length>300||typeof record.description!=='string'||
         !record.description.trim()||record.description.length>2000||
         typeof record.tags!=='string'||record.tags.length>400||
         record.status!=='reviewed'||record.reviewMethod!=='direct visual inspection'||
         updates.has(record.fileId))
        throw new Error('Review batch has a duplicate or invalid review entry.');
      updates.set(record.fileId,{
        filename:record.filename,description:record.description.trim(),
        tags:record.tags.trim(),status:'reviewed',updatedAt:Date.now()
      });
    }
    return updates;
  }
  function prepareChatGPTReviewMerge(records){
    const indexed=new Map(state.images.filter(x=>!x.demo).map(x=>[x.id,x]));
    const additions=new Map(),ignored=[];
    for(const [id,record] of records){
      const file=indexed.get(id);
      if(!file||file.name!==record.filename){
        ignored.push(record.filename+' (not found or filename changed)');
        continue;
      }
      if(state.reviewEdits.has(id)){
        ignored.push(record.filename+' (already has a personal review)');
        continue;
      }
      additions.set(id,{description:record.description,tags:record.tags,
        status:'reviewed',updatedAt:record.updatedAt});
    }
    return {additions,ignored};
  }
  async function importChatGPTReviewBatch(file){
    if(!file||!state.connected||!reviewStorageKey())return;
    if(file.size>MAX_REVIEW_BYTES)throw new Error('Review batch exceeds 2.6 MB.');
    const records=parseChatGPTReviewBatch(await file.text());
    const {additions,ignored}=prepareChatGPTReviewMerge(records);
    if(!additions.size)
      throw new Error('No matching unedited files in the current Drive index. Sync Drive or check filenames.');
    if(!confirm('Merge '+additions.size+' visually reviewed descriptions from ChatGPT into this device? '+
        ignored.length+' existing or unmatched records will be skipped. '+
        'Original Drive files, Sheets, and existing reviews will remain unchanged.'))return;
    const next=new Map(state.reviewEdits);
    for(const [id,record] of additions)next.set(id,record);
    writeReviewNotes(next);
    refreshReviewPresentation();
    alertUser('Merged '+additions.size+' visual reviews from ChatGPT. '+ignored.length+
      ' skipped; previously saved reviews preserved. Originals unchanged.','success');
  }

  async function importReviewBackup(file){
    if(!file||!state.connected)return;
    if(file.size>MAX_REVIEW_BYTES)throw new Error('Review backup exceeds 2.6 MB.');
    const next=parseReviewBackup(await file.text());
    if(!confirm('Replace the '+state.reviewEdits.size+' local review records with '+next.size+
        ' records from this backup? Drive and Sheets will not be changed.'))return;
    writeReviewNotes(next);
    refreshReviewPresentation();
    alertUser('Imported '+next.size+' review records for this Drive account. Originals unchanged.','success');
  }
  function renderReviewToolbar(){
    const shown=state.view==='review';
    $('reviewToolbar').classList.toggle('hidden',!shown);
    if(!shown)return;
    const counts=updateReviewCounts();
    $('reviewQueueFilter').value=state.reviewFilter;
    const done=counts.reviewed+counts['source-reviewed'];
    const total=counts.pending+counts.deferred+done;
    $('reviewProgress').textContent=format(done)+' reviewed / '+format(total)+' items';
    $('reviewHelp').textContent=format(counts.pending)+' need visual attention · '+
      format(counts.deferred)+' deferred · '+format(counts.reviewed)+
      ' reviewed locally. Missing EXIF dates and duplicate decisions are tracked separately in the Sheet.';
  }
  function populateReviewEditor(item){
    const editor=$('reviewForm');
    editor.classList.toggle('hidden',!state.connected||!!item.demo);
    if(!state.connected||item.demo)return;
    const local=state.reviewEdits.get(item.id),status=reviewStage(item);
    $('reviewDescription').value=effectiveDescription(item);
    $('reviewTags').value=effectiveTags(item);
    $('reviewEditorNote').textContent=local?
      'Saved locally · '+status.replace('-',' ')+' · '+new Date(local.updatedAt).toLocaleString():
      'From original spreadsheet · '+status.replace('-',' ')+'. Save to create your own local review.';
    $('reviewEditorStatus').textContent='';
    $('reviewDefer').textContent=status==='deferred'?'Keep for later':'Review later';
    $('reviewReset').disabled=!local;
    state.reviewDirty=false;
  }

  /* GENERATED SMART CONTROLLER START */
  function smartStorageKey(){
    return state.driveIdentity&&state.config.sheetId?
      SMART_COLLECTIONS_STORAGE+'-'+state.driveIdentity+'-'+state.config.sheetId:'';
  }
  function allSmartCollections(){
    return [...smartEngine.SMART_BUILTINS,...state.smartCollections];
  }
  function currentSmartCollection(){
    return allSmartCollections().find(x=>x.id===state.smartCollectionId)||null;
  }
  function smartContext(item){
    return {description:effectiveDescription(item),tags:effectiveTags(item),
      favorite:state.favorites.has(item.id)};
  }
  function smartFor(item,collection=currentSmartCollection()){
    return smartEngine.smartMatch(item,collection,smartContext(item));
  }
  function loadSmartCollections(){
    state.smartCollections=[];state.smartCollectionId='';state.smartStorageHealthy=true;
    const key=smartStorageKey();if(!key)return;
    try{
      const raw=localStorage.getItem(key);
      if(raw)state.smartCollections=smartEngine.smartParseBackup(raw);
    }catch(error){
      // Bad local data is never silently overwritten.
      state.smartStorageHealthy=false;
      alertUser('Saved Smart Collections need recovery; original data is preserved: '+error.message,'error');
    }
  }
  function saveSmartCollections(next){
    const key=smartStorageKey();
    if(!key)throw new Error('Connect Drive with a verified account identity first');
    if(!state.smartStorageHealthy)throw new Error('Invalid existing collection data was not overwritten');
    if(!Array.isArray(next)||next.length>smartEngine.SMART_COLLECTION_LIMIT)
      throw new Error('At most '+smartEngine.SMART_COLLECTION_LIMIT+' custom collections');
    const names=new Set(smartEngine.SMART_BUILTINS.map(x=>smartEngine.smartText(x.name)));
    for(const x of next){
      const valid=smartEngine.smartValidateCollection(x);
      if(!valid||names.has(smartEngine.smartText(x.name)))
        throw new Error('Invalid or duplicate collection');
      names.add(smartEngine.smartText(x.name));
    }
    const raw=smartEngine.smartExportBackup(next);
    try{localStorage.setItem(key,raw);}
    catch{throw new Error('Browser storage unavailable; collection rules were not modified');}
    state.smartCollections=next;
  }
  function renderSmartCollections(){
    $('smartCollectionStatus').textContent=state.connected?
      format(state.images.length)+' current media · '+state.smartCollections.length+
        ' custom collections · membership follows Drive changes':
      'Connect Drive to evaluate rules and create private collections.';
    $('smartAddButton').disabled=!state.connected||!smartStorageKey()||!state.smartStorageHealthy;
    $('smartImportButton').disabled=!state.connected||!smartStorageKey()||!state.smartStorageHealthy;
    $('smartExportButton').disabled=!state.connected||!state.smartCollections.length;
    $('smartCollectionCards').innerHTML=allSmartCollections().map(collection=>{
      const count=state.connected?smartEngine.smartMembers(state.images,collection,smartContext).length:0;
      const custom=!collection.id.startsWith('builtin-');
      return '<article class="smart-card"><div class="smart-card-heading"><span aria-hidden="true">✦</span><div><strong>'+
        escapeHTML(collection.name)+'</strong><small>'+format(count)+' files · '+
        (custom?'Custom':'Suggested')+'</small></div></div><p>'+
        escapeHTML(smartEngine.smartExplain(collection))+'</p><div class="smart-card-actions">'+
        '<button type="button" class="btn outline" data-smart-open="'+escapeHTML(collection.id)+'">Browse</button>'+
        (custom?'<button type="button" class="btn quiet" data-smart-edit="'+escapeHTML(collection.id)+'">Edit</button>'+
          '<button type="button" class="btn quiet" data-smart-delete="'+escapeHTML(collection.id)+'">Delete</button>':'')+
        '</div></article>';
    }).join('');
    const grid=$('smartCollectionCards');
    grid.querySelectorAll('[data-smart-open]').forEach(btn=>btn.onclick=()=>{
      state.smartCollectionId=btn.dataset.smartOpen;
      state.search='';state.folder='all';state.mediaType='all';state.page=1;
      $('searchInput').value='';$('mediaTypeSelect').value='all';
      displayPage('smart-results',{reset:false});
    });
    grid.querySelectorAll('[data-smart-edit]').forEach(btn=>btn.onclick=()=>openSmartEditor(btn.dataset.smartEdit));
    grid.querySelectorAll('[data-smart-delete]').forEach(btn=>btn.onclick=()=>deleteSmartCollection(btn.dataset.smartDelete));
  }
  function renderSmartRuleRows(){
    const draft=state.smartDraft;
    if(!draft)return;
    const labels={
      text:'Text across title, description, tags and category',
      name:'Filename',description:'Description',tags:'Tags',folder:'Folder',
      category:'Category',dateAfter:'Date on/after',dateBefore:'Date on/before',
      type:'Media type',favorite:'Favorite'
    };
    $('smartRuleRows').innerHTML=draft.rules.map((rule,i)=>'<div class="smart-rule-row">'+
      '<label>Field<select class="field" data-smart-field="'+i+'">'+
      smartEngine.SMART_FIELDS.map(field=>'<option value="'+field+'"'+
        (field===rule.field?' selected':'')+'>'+labels[field]+'</option>').join('')+
      '</select></label><label>Value<input class="field" required maxlength="150" data-smart-value="'+i+
      '" value="'+escapeHTML(rule.value)+'" placeholder="'+
      (rule.field==='type'?'image, gif, video, pdf':rule.field==='favorite'?'true or false':
        rule.field.startsWith('date')?'YYYY-MM-DD':'Word or phrase')+'"></label>'+
      '<button type="button" class="btn quiet" data-smart-remove="'+i+
      '" aria-label="Remove rule '+(i+1)+'"'+(draft.rules.length<=1?' disabled':'')+'>Remove</button></div>').join('');
    const rows=$('smartRuleRows');
    rows.querySelectorAll('[data-smart-field]').forEach(sel=>sel.onchange=e=>{
      draft.rules[Number(e.target.dataset.smartField)].field=e.target.value;
      renderSmartRuleRows();
    });
    rows.querySelectorAll('[data-smart-value]').forEach(input=>input.oninput=e=>{
      draft.rules[Number(e.target.dataset.smartValue)].value=e.target.value;
    });
    rows.querySelectorAll('[data-smart-remove]').forEach(btn=>btn.onclick=()=>{
      if(draft.rules.length<=1)return;
      draft.rules.splice(Number(btn.dataset.smartRemove),1);
      renderSmartRuleRows();
    });
    $('smartAddRuleButton').disabled=draft.rules.length>=smartEngine.SMART_RULE_LIMIT;
  }
  function openSmartEditor(id=''){
    if(!state.connected||!smartStorageKey()||!state.smartStorageHealthy)return;
    const current=state.smartCollections.find(c=>c.id===id);
    state.smartDraft=current?{...current,rules:current.rules.map(x=>({...x}))}:
      {id:'',name:'',mode:'any',rules:[{field:'text',value:''}]};
    $('smartDialogTitle').textContent=current?'Edit Smart Collection':'New Smart Collection';
    $('smartName').value=state.smartDraft.name;
    $('smartMode').value=state.smartDraft.mode;
    renderSmartRuleRows();
    $('smartEditorDialog').showModal();
    $('smartName').focus();
  }
  function saveSmartEditor(event){
    event.preventDefault();
    const draft=state.smartDraft;if(!draft)return;
    const now=Date.now(),existing=state.smartCollections.find(x=>x.id===draft.id);
    let id=existing?.id||('c'+now+'_1'),suffix=1;
    while(!existing&&state.smartCollections.some(x=>x.id===id))id='c'+now+'_'+(++suffix);
    const item=smartEngine.smartValidateCollection({id,name:$('smartName').value.trim(),
      mode:$('smartMode').value,rules:draft.rules,
      createdAt:existing?.createdAt??now,updatedAt:now});
    if(!item){alertUser('Check every rule: valid date YYYY-MM-DD, type image/gif/video/pdf, or favorite true/false.','error');return;}
    const next=existing?state.smartCollections.map(x=>x.id===id?item:x):[...state.smartCollections,item];
    try{saveSmartCollections(next);}
    catch(error){alertUser(error.message,'error');return;}
    state.smartDraft=null;$('smartEditorDialog').close();
    renderSmartCollections();alertUser('Collection rules saved locally; Drive files untouched.','success');
  }
  function deleteSmartCollection(id){
    const item=state.smartCollections.find(x=>x.id===id);
    if(!item||!confirm('Delete Smart Collection "'+item.name+'"? No Drive files will be changed.'))return;
    try{saveSmartCollections(state.smartCollections.filter(x=>x.id!==id));}
    catch(error){alertUser(error.message,'error');return;}
    if(state.smartCollectionId===id)state.smartCollectionId='';
    renderSmartCollections();
  }
  function exportSmartCollections(){
    if(!state.smartCollections.length)return;
    const raw=smartEngine.smartExportBackup(state.smartCollections);
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;link.download='image-vault-smart-collections.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    alertUser('Exported collection rules only; private photos were not included.','success');
  }
  async function importSmartCollections(file){
    if(!state.connected||!smartStorageKey())throw new Error('Connect Drive first');
    if(!state.smartStorageHealthy)throw new Error('Existing invalid collection data was preserved');
    if(!file||file.size>smartEngine.SMART_BACKUP_LIMIT)throw new Error('Backup exceeds 100 KB');
    const imported=smartEngine.smartParseBackup(await file.text());
    const ids=new Set(state.smartCollections.map(x=>x.id));
    const names=new Set(allSmartCollections().map(x=>smartEngine.smartText(x.name)));
    const additions=[];
    for(const item of imported){
      if(ids.has(item.id)||names.has(smartEngine.smartText(item.name)))continue;
      ids.add(item.id);names.add(smartEngine.smartText(item.name));additions.push(item);
    }
    if(!additions.length){alertUser('All imported rules already exist. No changes made.');return;}
    if(state.smartCollections.length+additions.length>smartEngine.SMART_COLLECTION_LIMIT)
      throw new Error('Import would exceed the 40-collection limit');
    if(!confirm('Import '+additions.length+' new collection rules? Existing rules and Drive files remain unchanged.'))return;
    saveSmartCollections([...state.smartCollections,...additions]);
    renderSmartCollections();
    alertUser('Imported '+additions.length+' collections; skipped '+(imported.length-additions.length)+' existing.','success');
  }
  /* GENERATED SMART CONTROLLER END */
  /* GENERATED MEMORY CONTROLLER START */
  function memoryCurrentSnapshot(){
    return memoryEngine.memoryBuildTimeline(state.connected?state.images:[],{
      year:state.memoryYear,source:state.memorySource,now:new Date()
    });
  }
  function memoryOpenGroup(key){
    if(!state.connected)return;
    state.memorySelection={key,source:state.memorySource};
    state.search='';state.folder='all';state.mediaType='all';state.page=1;
    state.sort='date-desc';
    $('searchInput').value='';$('mediaTypeSelect').value='all';
    $('sortSelect').value='date-desc';
    displayPage('memory-results',{reset:false});
  }
  function memoryMonthDetail(group){
    const sources=[];
    if(group.sources.exif)sources.push(format(group.sources.exif)+' camera');
    if(group.sources.filename)sources.push(format(group.sources.filename)+' filename');
    if(group.sources['drive-upload'])sources.push(format(group.sources['drive-upload'])+' Drive-added');
    return sources.join(' · ');
  }
  function renderMemoryLane(){
    const year=$('memoryYearSelect'),source=$('memorySourceSelect');
    const stats=memoryCurrentSnapshot();
    const years=stats.years;
    year.innerHTML='<option value="all">All years</option>'+
      years.map(y=>'<option value="'+escapeHTML(y)+'">'+escapeHTML(y)+'</option>').join('');
    if(state.memoryYear!=='all'&&!years.includes(state.memoryYear))state.memoryYear='all';
    year.value=state.memoryYear;source.value=state.memorySource;
    const totals=stats.sourceCounts;
    $('memoryOverview').textContent=state.connected?
      format(stats.total)+' indexed media · '+
      format(totals.exif)+' camera dates · '+
      format(totals.filename)+' filename dates · '+
      format(totals['drive-upload'])+' Drive-added dates · '+
      format(totals.unknown)+' undated':
      'Connect Drive to browse your private media timeline.';
    const day=stats.onThisDay;
    $('memoryTodayHeading').textContent='On This Day · '+new Date().toLocaleDateString(undefined,{
      month:'long',day:'numeric'});
    $('memoryTodayCount').textContent=day.length?
      format(day.length)+' older media with a capture or filename date matching today':
      'No verified capture or filename dates on this day in past years.';
    $('memoryTodayButton').disabled=!state.connected||!day.length;
    $('memoryTodayExamples').textContent=day.slice(0,5).map(x=>
      x.evidence.day.slice(0,4)+' · '+x.item.name).join('  ·  ');
    $('memoryMonthCards').innerHTML=stats.months.length?stats.months.map(g=>
      '<article class="memory-month"><span class="memory-month-icon" aria-hidden="true">▧</span>'+
      '<div><strong>'+escapeHTML(memoryEngine.memoryMonthLabel(g.key))+'</strong>'+
      '<small>'+format(g.count)+' media · '+escapeHTML(memoryMonthDetail(g))+'</small>'+
      '<p>'+escapeHTML(g.sample.map(x=>x.name).join(' · '))+'</p></div>'+
      '<button type="button" class="btn outline" data-memory-key="'+escapeHTML(g.key)+
      '">Browse month</button></article>').join(''):
      '<p class="memory-empty">No media matches the selected year and date source.</p>';
    const unknownVisible=state.memoryYear==='all'&&stats.unknownCount>0;
    $('memoryUnknown').classList.toggle('hidden',!unknownVisible);
    $('memoryUnknownCount').textContent=format(stats.unknownCount)+' files without a usable date';
    $('memoryUnknownButton').disabled=!state.connected||!unknownVisible;
    $('memoryMonthCards').querySelectorAll('[data-memory-key]').forEach(btn=>
      btn.onclick=()=>memoryOpenGroup(btn.dataset.memoryKey));
  }
  function memorySourceLabel(item){
    const e=memoryEngine.memoryEvidence(item);
    return e.day?e.day+' · '+e.label:e.label;
  }
  function memoryTitle(){
    const key=state.memorySelection.key;
    if(key==='today')return 'On This Day';
    if(key==='unknown')return 'Unknown dates';
    return memoryEngine.memoryMonthLabel(key);
  }
  /* GENERATED MEMORY CONTROLLER END */
  function savedSearchStorageKey(){
    return state.driveIdentity&&state.config.sheetId?
      SAVED_SEARCHES_STORAGE+'-'+state.driveIdentity+'-'+state.config.sheetId:'';
  }
  function validateSavedSearch(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||
      typeof value.id!=='string'||!/^s\d{10,20}$/.test(value.id)||
      typeof value.name!=='string'||!value.name.trim()||value.name.length>80||
      typeof value.query!=='string'||value.query.length>searchEngine.SEARCH_MAX_QUERY||
      typeof value.folder!=='string'||value.folder.length>300||
      !['all','image','video','pdf'].includes(value.mediaType)||
      !['name','relevance','date-desc','date-asc','review'].includes(value.sort)||
      !Number.isFinite(value.createdAt)||value.createdAt<0||
      value.createdAt>Date.now()+60000)return null;
    return {id:value.id,name:value.name,query:value.query,folder:value.folder,
      mediaType:value.mediaType,sort:value.sort,createdAt:value.createdAt};
  }
  function loadSavedSearches(){
    state.savedSearches=[];state.activeSavedSearch='';
    const key=savedSearchStorageKey();if(!key)return;
    try{
      const raw=localStorage.getItem(key);
      if(!raw)return;
      if(raw.length>25000)throw new Error('Saved-search file exceeds limit');
      const saved=JSON.parse(raw);
      if(!Array.isArray(saved)||saved.length>MAX_SAVED_SEARCHES)throw new Error('Invalid saved-search collection');
      const ids=new Set();
      const valid=saved.map(validateSavedSearch);
      if(valid.some(x=>!x||ids.has(x.id)||!ids.add(x.id)))
        throw new Error('Invalid or duplicate saved search');
      state.savedSearches=valid;
    }catch(error){
      // Preserve the original invalid local data for manual recovery.
      alertUser('Saved searches could not be loaded: '+error.message+'. Stored data was not overwritten.','error');
    }
  }
  function storeSavedSearches(next){
    const key=savedSearchStorageKey();
    if(!key)throw new Error('Connect to Drive before saving searches');
    if(next.length>MAX_SAVED_SEARCHES||next.some(x=>!validateSavedSearch(x)))
      throw new Error('Saved-search limit or validation failed');
    const serialized=JSON.stringify(next);
    if(serialized.length>25000)throw new Error('Saved-search data too large');
    try{localStorage.setItem(key,serialized);}
    catch{throw new Error('Browser storage unavailable; export a browser backup before clearing data');}
    state.savedSearches=next;
  }
  function renderSavedSearches(){
    const select=$('savedSearchSelect');if(!select)return;
    select.innerHTML='<option value="">Saved searches</option>'+
      state.savedSearches.map(s=>'<option value="'+escapeHTML(s.id)+'">'+escapeHTML(s.name)+'</option>').join('');
    select.value=state.activeSavedSearch;
    $('saveSearchButton').disabled=!state.connected||!state.search.trim();
    $('deleteSavedSearchButton').disabled=!state.connected||
      !state.savedSearches.some(x=>x.id===state.activeSavedSearch);
  }
  function openSaveSearchDialog(){
    if(!state.connected||!state.search.trim())return;
    $('savedSearchName').value=state.search.trim().slice(0,80);
    $('saveSearchDialog').showModal();
    $('savedSearchName').focus();
  }
  function saveNamedSearch(event){
    event.preventDefault();
    const name=$('savedSearchName').value.trim();
    if(!name||name.length>80){alertUser('Choose a search name between 1 and 80 characters.','error');return;}
    if(state.savedSearches.length>=MAX_SAVED_SEARCHES){
      alertUser('You can save at most '+MAX_SAVED_SEARCHES+' searches. Delete an old search first.','error');return;
    }
    if(state.savedSearches.some(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase())){
      alertUser('A saved search already has that name. Choose a different name.','error');return;
    }
    let createdAt=Date.now(),id='s'+createdAt;
    while(state.savedSearches.some(x=>x.id===id)){createdAt++;id='s'+createdAt;}
    const entry={id,name,query:state.search.slice(0,searchEngine.SEARCH_MAX_QUERY),
      folder:state.folder,mediaType:state.mediaType,sort:state.sort,createdAt};
    try{storeSavedSearches([...state.savedSearches,entry]);}
    catch(error){alertUser(error.message,'error');return;}
    state.activeSavedSearch=id;
    $('saveSearchDialog').close();
    renderSavedSearches();
    alertUser('Saved "'+name+'" to this device for the current Drive account.','success');
  }
  function applySavedSearch(id){
    const saved=state.savedSearches.find(x=>x.id===id);
    if(!saved)return;
    state.activeSavedSearch=saved.id;
    state.search=saved.query;
    state.folder=saved.folder==='all'||state.folders.some(x=>x.path===saved.folder)?saved.folder:'all';
    state.mediaType=saved.mediaType;
    state.sort=saved.sort;
    state.page=1;
    $('searchInput').value=state.search;
    $('mediaTypeSelect').value=state.mediaType;
    $('sortSelect').value=state.sort;
    displayPage('all',{reset:false});
  }
  function deleteSavedSearch(){
    const target=state.savedSearches.find(x=>x.id===state.activeSavedSearch);
    if(!target||!confirm('Delete saved search "'+target.name+'"? Your photos and searches are not modified.'))return;
    try{storeSavedSearches(state.savedSearches.filter(x=>x.id!==target.id));}
    catch(error){alertUser(error.message,'error');return;}
    state.activeSavedSearch='';
    renderSavedSearches();
    alertUser('Saved search deleted from this device.','success');
  }
  function readFavorites() {
    try {const f = JSON.parse(localStorage.getItem(FAVORITES_STORAGE) || '[]'); return Array.isArray(f) ? f.filter(safeId) : [];}
    catch {return [];}
  }
  function alertUser(message, type = '') {
    const el = $('alert'); el.textContent = message; el.className = `alert ${type}`;
    el.classList.remove('hidden');
  }
  function clearAlert() {$('alert').classList.add('hidden');}
  function updateStatus() {
    const status = $('connectionStatus');
    const expired = state.connected && Date.now() > state.expiry;
    status.className = 'connection-status' + (expired ? ' error' : state.connected ? ' online' : '');
    status.innerHTML = `<i></i>${expired ? 'Session expired' : state.connected ? 'Drive connected' : 'Preview mode'}`;
    $('connectButton').classList.toggle('hidden', state.connected && !expired);
    $('disconnectButton').classList.toggle('hidden', !state.connected);
    $('heroConnectButton').classList.toggle('hidden', state.connected);
    $('allCount').textContent = state.connected ? format(state.images.length) : '—';
    updateReviewCounts();
    $('footerStatus').textContent = state.connected ? 'Private media metadata · Read-only Drive access' : 'Preview · Connect to browse private files';
    $('syncButton').classList.toggle('hidden', !state.connected);
  }
  function showSettings() {
    $('clientIdInput').value = state.config.clientId;
    $('sheetIdInput').value = state.config.sheetId;
    $('originText').textContent = location.origin;
    $('settingsDialog').showModal();
  }
  function saveSettings(event) {
    event.preventDefault();
    const clientId = $('clientIdInput').value.trim();
    const sheetId = $('sheetIdInput').value.trim();
    if (!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
      $('clientIdInput').setCustomValidity('Enter a Google OAuth Web application client ID.');
      $('clientIdInput').reportValidity();
      return;
    }
    if (!safeId(sheetId)) {
      $('sheetIdInput').setCustomValidity('Enter the raw spreadsheet ID, not the full URL.');
      $('sheetIdInput').reportValidity();
      return;
    }
    $('clientIdInput').setCustomValidity(''); $('sheetIdInput').setCustomValidity('');
    const changed = clientId !== state.config.clientId || sheetId !== state.config.sheetId;
    if (changed && state.connected) disconnect();
    state.config = {clientId, sheetId};
    try {
      if ($('rememberConfig').checked) localStorage.setItem(SHELL_STORAGE, JSON.stringify(state.config));
      else localStorage.removeItem(SHELL_STORAGE);
    } catch { alertUser('Browser storage is disabled. Settings will be kept only while this tab is open.', 'error'); }
    state.tokenClient = null;
    $('settingsDialog').close();
    alertUser('Connection settings saved on this device' + ($('rememberConfig').checked ? '.' : ' for this tab only.') + ' Select Connect Drive to authorize read-only access.', 'success');
  }
  async function connect() {
    clearAlert();
    if (!state.config.clientId || !state.config.sheetId) {showSettings(); return;}
    if (!window.google?.accounts?.oauth2) {alertUser('Google sign-in is still loading, or it is blocked by your browser. Check your connection, then select Connect Drive again.', 'error');return;}
    try {
      if (!state.tokenClient) {
        state.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: state.config.clientId,
          scope: SCOPES,
          callback: async response => {
            if (!response?.access_token) {alertUser('Google authorization did not return an access token. Try connecting again.', 'error');return;}
            state.accessToken = response.access_token;
            state.expiry = Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000;
            await loadLiveIndex();
          },
          error_callback: response => alertUser(`Google sign-in could not open: ${response?.type || 'unknown error'}.`, 'error')
        });
      }
      state.tokenClient.requestAccessToken({prompt: 'consent'});
    } catch (error) {alertUser(`Connection could not start: ${error.message || error}`, 'error');}
  }
  async function googleGet(url, {blob = false, maxBytes = null, signal = undefined} = {}) {
    if (!state.accessToken || Date.now() > state.expiry) { updateStatus(); throw new Error('Your Google session expired. Choose Connect Drive to authorize again.'); }
    // Never send a Google access token to a thumbnail URL or any non-API host.
    const host = new URL(url).hostname;
    if (!['www.googleapis.com', 'sheets.googleapis.com'].includes(host)) throw new Error('Blocked non-Google API request.');
    const response = await fetch(url, {method:'GET',mode:'cors',credentials:'omit',headers:{'Authorization':`Bearer ${state.accessToken}`},cache:'no-store',referrerPolicy:'no-referrer',signal});
    if (!response.ok) {
      const detail=await response.json().catch(()=>({}));
      const reason=detail?.error?.errors?.[0]?.reason || detail?.error?.status || '';
      const temporaryQuota = response.status===403 && ['rateLimitExceeded','userRateLimitExceeded'].includes(reason);
      const retryable = temporaryQuota || response.status===429 || response.status>=500;
      let message=`Google returned HTTP ${response.status}`;
      if(response.status===401){state.expiry=0;updateStatus();message='Your Google session expired. Choose Connect Drive again.';}
      else if(temporaryQuota||response.status===429)message='Google is temporarily rate limiting requests.';
      else if(response.status===403)message='Google denied read access. Check this account and the enabled API.';
      const error=new Error(message);
      error.httpStatus=response.status;
      error.reason=reason;
      error.retryable=retryable;
      throw error;
    }
    if (!blob) return response.json();
    const headerSize = Number(response.headers.get('content-length') || 0);
    if (maxBytes && headerSize > maxBytes) {await response.body?.cancel(); throw new Error('Image is too large for a quick preview.');}
    if (!maxBytes || !response.body) {
      const data = await response.blob();
      if (maxBytes && data.size > maxBytes) throw new Error('Media is too large for a preview. Open in Drive.');
      return data;
    }
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('Media is too large for a preview. Open in Drive.');
        chunks.push(value);
      }
    } catch (error) {await reader.cancel().catch(()=>{});throw error;}
    return new Blob(chunks, {type:response.headers.get('content-type') || 'application/octet-stream'});
  }
  async function readSpreadsheetSnapshot() {
      const id = encodeURIComponent(state.config.sheetId);
      const ranges = ["'Search Index'!A:M", "'Manifest'!A:L", "'Folders'!A:G", "'Manifest'!T:T", "'Manifest'!AC:AC"];
      const params = ranges.map(x => `ranges=${encodeURIComponent(x)}`).join('&');
      const data = await googleGet(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}&valueRenderOption=FORMATTED_VALUE`);
      const index = data.valueRanges?.[0]?.values || [];
      const manifest = data.valueRanges?.[1]?.values || [];
      const folders = data.valueRanges?.[2]?.values || [];
      const reviewStatuses = data.valueRanges?.[3]?.values || [];
      const analysisMethods = data.valueRanges?.[4]?.values || [];
      if ((index[0] || [])[0] !== 'Collection' || (manifest[0] || [])[0] !== 'Collection' ||
          reviewStatuses[0]?.[0] !== 'Review status' || analysisMethods[0]?.[0] !== 'Analysis method')
        throw new Error('This inventory needs Search Index and Manifest visual-review columns. No existing data was changed.');
      const byId = new Map();
      for (let row=1;row<manifest.length;row++) {
        const r=manifest[row]||[];
        if (safeId(r[3])) byId.set(r[3], {
          url:r[4]||'',mime:r[5]||'',size:Number(r[6]||0),
          review:reviewStatuses[row]?.[0]||'',analysisMethod:analysisMethods[row]?.[0]||'',
          filenameDate:r[9]||'',filenameDateEvidence:r[10]||'',
          driveCreatedAt:r[7]||'',driveModifiedAt:r[8]||''
        });
      }
      const images = [];
      const found = new Set();
      for (const r of index.slice(1)) {
        const id = r[10]; const source = byId.get(id);
        if (!safeId(id) || !source || !supportedMedia(source.mime) || found.has(id)) continue;
        found.add(id);
        images.push(mediaContract.normalizeMediaRecord({id,collection:r[0]||'',folder:r[1]||'',name:r[2]||'Untitled image',description:r[4]||'',tags:r[5]||'',captureDate:r[7]||'',filenameDate:source.filenameDate,filenameDateEvidence:source.filenameDateEvidence,
        driveCreatedAt:source.driveCreatedAt,driveModifiedAt:source.driveModifiedAt,review:source.review||r[9]||'',analysisMethod:source.analysisMethod,confidence:r[11]||'',category:r[12]||'',mime:source.mime,size:source.size,url:linkToDrive({id}),demo:false}));
      }
      if (!images.length) throw new Error('No matching media rows were found. Check the inventory spreadsheet ID.');
      const baseFolderSources = folders.slice(1).filter(r=>safeId(r[2]) && /^((Memes)|(Jacks Photos))\//.test(r[1]||''))
        .map(r=>({path:r[1],id:r[2],indexedTotal:Number(r[4]||0),inventoryPath:r[1],discovered:false}));
    return {images,baseFolderSources};
  }
  async function loadLiveIndex() {
    // Invalidate previous scans before loading a refreshed spreadsheet snapshot.
    stopScans();
    const btn = $('connectButton'); btn.disabled = true; btn.textContent = 'Reading library…';
    try {
      // Bind cached file metadata to the actual signed-in Drive account.
      // If unavailable, the app continues without using local cache.
      state.driveIdentity=null;
      try{
        const about=await googleGet('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)');
        if(safeId(about?.user?.permissionId))state.driveIdentity=about.user.permissionId;
      }catch{}
      const {images,baseFolderSources}=await readSpreadsheetSnapshot();
      state.inventory=images;
      state.baseFolderSources=baseFolderSources;
      state.folderSources=baseFolderSources.slice();
      state.libraryRoots=[];state.lastDiscoveryAt=null;state.lastFallbackScanAt=null;state.discoveryError=null;
      state.syncedFolders.clear();state.health.clear();state.scanFailures.clear();state.lastScanAt=null;state.lastFullScanAt=null;state.changeToken=null;
      clearThumbnailCache(); state.images = images; state.connected = true; state.folder = 'all'; state.page = 1;
      const reviewLoadWarning=loadReviewNotes();
      loadSavedSearches();
      loadSmartCollections();
      state.memoryYear='all';state.memorySource='all';state.memorySelection={key:'all',source:'all'};
      if(restoreSyncCache())mergeLiveFolders();
      buildFolderIndex(); updateStatus();
      const resumed=restoreBrowsingPosition();
      displayPage(resumed?state.view:'home',{reset:false,scroll:false});
      if(resumed)finishBrowsingRestore();
      clearAlert();
      if(reviewLoadWarning)alertUser('Drive connected, but '+reviewLoadWarning,'error');
      else alertUser(`${format(images.length)} files loaded from your read-only Drive inventory. Originals unchanged.`, 'success');
      scheduleScans();
    } catch (error) {
      // An unsuccessful refresh must not leave the previous user's private index in memory.
      stopScans();clearThumbnailCache();
      state.inventory=[];state.folderSources=[];state.baseFolderSources=[];state.libraryRoots=[];state.lastDiscoveryAt=null;state.lastFallbackScanAt=null;state.discoveryError=null;state.syncedFolders.clear();state.health.clear();state.scanFailures.clear();state.lastScanAt=null;state.changeToken=null;state.driveIdentity=null;state.lastFullScanAt=null;
      state.images=DEMO;state.connected=false;state.reviewEdits.clear();state.savedSearches=[];state.activeSavedSearch='';state.smartCollections=[];state.smartCollectionId='';state.smartStorageHealthy=true;state.reviewFilter='pending';state.folder='all';state.page=1;
      buildFolderIndex();updateStatus();render();
      alertUser(`Could not load the library: ${error.message || error}`,'error');
    }
    finally {btn.disabled = false; btn.textContent = 'Connect Drive';}
  }

  async function refreshSheetAndDrive() {
    if(!state.connected)return false;
    if(state.scanning){
      updateScanSummary('A Drive scan is in progress. Retry sync when it finishes.');
      return false;
    }
    if(state.reviewDirty){
      alertUser('Save or discard the review you are editing before syncing. Your changes are untouched.','error');
      return false;
    }
    const button=$('syncButton');
    button.disabled=true;
    updateScanSummary('Reloading visual review statuses from the Google Sheet…');
    let snapshot;
    try{
      // Fetch first, commit second: a Sheets error never discards a verified gallery.
      snapshot=await readSpreadsheetSnapshot();
    }catch(error){
      updateScanSummary('Spreadsheet refresh failed: '+(error?.message||error)+'. Previous gallery retained.',true);
      alertUser('Could not refresh the spreadsheet: '+(error?.message||error)+'. Previous reviews were kept.','error');
      button.disabled=false;
      return false;
    }
    const signature=folders=>folders.map(f=>f.path+':'+f.id).sort().join('|');
    const changedFolders=signature(snapshot.baseFolderSources)!==signature(state.baseFolderSources);
    state.inventory=snapshot.images;
    state.baseFolderSources=snapshot.baseFolderSources;
    if(state.syncedFolders.size)mergeLiveFolders();
    else{state.images=snapshot.images;buildFolderIndex();updateStatus();render();}
    alertUser('Refreshed '+format(snapshot.images.length)+' inventory entries from Google Sheets. Local reviews preserved.','success');
    updateScanSummary('Spreadsheet reviews updated. Checking read-only Drive changes…');
    button.disabled=false;
    await syncWithDrive({full:changedFolders});
    return true;
  }

  function syncCacheSignature(){
    // The cache is tied to this inventory's exact known folders.
    return (state.baseFolderSources.length?state.baseFolderSources:state.folderSources)
      .map(f=>f.path+':'+f.id).sort().join('|');
  }
  function clearLocalSyncCache(){
    try{localStorage.removeItem(SYNC_CACHE_STORAGE);}catch{}
  }
  function rememberSyncCache(){
    if(!state.driveIdentity||!state.changeToken||state.syncedFolders.size!==state.folderSources.length)return;
    // Only metadata and Drive's change cursor are stored locally. Never store
    // private file contents, Google bearer tokens or cached image bytes.
    const cache={schema:4,sheetId:state.config.sheetId,driveIdentity:state.driveIdentity,signature:syncCacheSignature(),
      savedAt:Date.now(),fullScanAt:state.lastFullScanAt,discoveredAt:state.lastDiscoveryAt,token:state.changeToken,
      roots:state.libraryRoots.map(root=>({id:root.id,path:root.path})),
      sources:state.folderSources.map(f=>({id:f.id,path:f.path,
        inventoryPath:f.inventoryPath||null,missing:!!f.missing,discovered:!!f.discovered})),
      folders:[...state.syncedFolders].map(([path,files])=>({path,files:files.map(f=>({
        id:f.id,name:f.name,mimeType:f.mimeType,size:f.size||0,modifiedTime:f.modifiedTime||''
      }))}))};
    const json=JSON.stringify(cache);
    if(json.length>MAX_SYNC_CACHE)return; // Never exhaust localStorage on huge libraries.
    try{localStorage.setItem(SYNC_CACHE_STORAGE,json);}catch{}
  }
  function restoreSyncCache(){
    let data;
    try{
      const raw=localStorage.getItem(SYNC_CACHE_STORAGE);
      if(!raw||raw.length>MAX_SYNC_CACHE)return false;
      data=JSON.parse(raw);
    }catch{return false;}
    if(!state.driveIdentity||!data||data.schema!==4||data.driveIdentity!==state.driveIdentity||
      data.sheetId!==state.config.sheetId||data.signature!==syncCacheSignature())return false;
    if(!Number.isFinite(data.savedAt)||Date.now()-data.savedAt>30*24*60*60*1000||data.savedAt>Date.now()+60*1000)return false;
    if(typeof data.token!=='string'||!data.token||data.token.length>2048||!Array.isArray(data.folders))return false;
    const verifiedAt=Date.parse(data.fullScanAt);
    if(!Number.isFinite(verifiedAt)||verifiedAt>data.savedAt+60000||verifiedAt>Date.now()+60000)return false;
    const roots=Array.isArray(data.roots)?data.roots:[];
    const sources=Array.isArray(data.sources)?data.sources:[];
    const baseline=state.baseFolderSources.length?state.baseFolderSources:state.folderSources;
    const baseIds=new Set(baseline.map(f=>f.id)),seenBase=new Set();
    const allowedPaths=new Set(),seenIds=new Set();
    if(sources.length<baseline.length||sources.length>MAX_DISCOVERED_FOLDERS+baseline.length+2)return false;
    if(roots.length>2)return false;
    if(state.baseFolderSources.length&&!roots.length)return false;
    for(const root of roots){
      if(!root||!safeId(root.id)||!['Memes','Jacks Photos'].includes(root.path))return false;
    }
    for(const source of sources){
      if(!source||!safeId(source.id)||typeof source.path!=='string'||source.path.length>300||
         !(source.path==='Memes'||source.path==='Jacks Photos'||source.path.startsWith('Memes/')||source.path.startsWith('Jacks Photos/'))||
         allowedPaths.has(source.path)||seenIds.has(source.id))return false;
      allowedPaths.add(source.path);seenIds.add(source.id);
      if(baseIds.has(source.id)){
        const base=baseline.find(f=>f.id===source.id);
        if((source.inventoryPath||null)!==(state.baseFolderSources.length?base.path:null))return false;
        seenBase.add(source.id);
      }else if(source.inventoryPath)return false;
    }
    if(seenBase.size!==baseIds.size||data.folders.length!==sources.length)return false;
    const map=new Map();
    let total=0;
    for(const entry of data.folders){
      if(!entry||!allowedPaths.has(entry.path)||map.has(entry.path)||!Array.isArray(entry.files))return false;
      const files=[];
      for(const f of entry.files){
        if(!safeId(f.id)||typeof f.name!=='string'||f.name.length>512||!supportedMedia(f.mimeType))return false;
        if(++total>20000)return false;
        files.push({id:f.id,name:f.name,mimeType:f.mimeType,size:Number(f.size)||0,modifiedTime:f.modifiedTime||''});
      }
      map.set(entry.path,files);
    }
    state.folderSources=sources.map(f=>({...f}));
    state.libraryRoots=roots.map(root=>({...root}));
    state.lastDiscoveryAt=typeof data.discoveredAt==='string'?data.discoveredAt:null;
    state.syncedFolders=map;
    state.changeToken=data.token;
    state.lastFullScanAt=new Date(verifiedAt).toISOString();
    state.lastScanAt=new Date(data.savedAt).toISOString();
    for(const folder of state.folderSources)refreshFolderHealth(folder.path);
    return true;
  }
  function refreshFolderHealth(path){
    const files=state.syncedFolders.get(path);
    if(!files)return;
    const source=state.folderSources.find(f=>f.path===path);
    const inventoryPath=source?.inventoryPath||path;
    const known=state.inventory.filter(x=>x.folder===inventoryPath);
    const knownIDs=new Set(known.map(x=>x.id)),currentIDs=new Set(files.map(x=>x.id));
    state.health.set(path,{
      folder:path,sourceCount:known.length,driveCount:files.length,
      added:files.filter(x=>!knownIDs.has(x.id)).map(x=>({id:x.id,name:x.name,mime:x.mimeType})),
      missing:known.filter(x=>!currentIDs.has(x.id)).map(x=>({id:x.id,name:x.name,mime:x.mime})),
      checkedAt:new Date().toISOString()
    });
  }
  async function startChangeCursor(signal){
    const data=await googleGet('https://www.googleapis.com/drive/v3/changes/startPageToken?fields=startPageToken&supportsAllDrives=true',{signal});
    if(typeof data.startPageToken!=='string'||!data.startPageToken)throw new Error('Google did not return a changes cursor');
    return data.startPageToken;
  }

  function stopScans() {
    if(state.scanTimer)clearInterval(state.scanTimer);
    if(state.scanDelayTimer)clearTimeout(state.scanDelayTimer);
    state.scanTimer=null;state.scanDelayTimer=null;
    state.scanGeneration++;
    state.scanController?.abort();
    state.scanController=null;
    state.scanning=false;
    $('syncButton').disabled=false;
    $('healthScanButton').disabled=false;
  }
  function scheduleScans() {
    stopScans();
    // Defer metadata scanning to give visible thumbnail requests priority.
    state.scanDelayTimer=setTimeout(()=>{
      state.scanDelayTimer=null;
      if(state.connected&&document.visibilityState!=='hidden'&&!state.lastScanAt)syncWithDrive({quiet:true});
    },12000);
    state.scanTimer=setInterval(()=>{
      if(!state.connected||document.visibilityState==='hidden'||state.scanning||Date.now()>=state.expiry)return;
      const verified=Date.parse(state.lastFullScanAt||state.lastFallbackScanAt||'');
      const due=!Number.isFinite(verified)||Date.now()-verified>=FULL_SCAN_INTERVAL;
      syncWithDrive({quiet:true,full:due});
    },SCAN_INTERVAL);
  }
  async function listKnownFolder(folder,signal) {
    const files=[], seenIDs=new Set(), seenPages=new Set();
    let pageToken='',pageCount=0,rawCount=0;
    do {
      if(signal?.aborted)throw new Error('Scan cancelled');
      if(++pageCount>40)throw new Error('Folder exceeded safe pagination limit (40 pages).');
      const q=`'${folder.id}' in parents and trashed = false`;
      const params=new URLSearchParams({
        q,fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime)',
        pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'
      });
      if(pageToken)params.set('pageToken',pageToken);
      const url=`https://www.googleapis.com/drive/v3/files?${params.toString()}`;
      let data,attempt=0;
      while(true) {
        try{data=await googleGet(url,{signal});break;}
        catch(error) {
          if(signal?.aborted||!error.retryable||++attempt>=4)throw error;
          // Bounded exponential backoff. Permanent 403s are never retried.
          await new Promise(resolve=>setTimeout(resolve,Math.min(2500,400*2**(attempt-1))));
        }
      }
      if(signal?.aborted)throw new Error('Scan cancelled');
      if(data.incompleteSearch)throw new Error('Google returned an incomplete folder listing; previous results retained.');
      const pageFiles=data.files||[];
      rawCount+=pageFiles.length;
      if(rawCount>20000)throw new Error('Folder scan size limit exceeded.');
      for(const f of pageFiles){
        if(safeId(f.id)&&supportedMedia(f.mimeType)&&!seenIDs.has(f.id)){
          files.push(f);seenIDs.add(f.id);
        }
      }
      const next=data.nextPageToken||'';
      if(next&&seenPages.has(next))throw new Error('Google repeated a pagination token; previous results retained.');
      if(next)seenPages.add(next);
      pageToken=next;
    }while(pageToken);
    return files;
  }

  const DRIVE_FOLDER_MIME='application/vnd.google-apps.folder';
  const displayFolderPart=name=>String(name||'Untitled folder').replaceAll('/','／')
    .split('').map(c=>c.charCodeAt(0)<32?' ':c).join('').trim().slice(0,90)||'Untitled folder';

  async function readDiscoveryMetadata(url,signal){
    let attempt=0;
    while(true){
      try{return await googleGet(url,{signal});}
      catch(error){
        if(signal?.aborted||!error.retryable||++attempt>=4)throw error;
        await new Promise(resolve=>setTimeout(resolve,Math.min(2500,350*(2**attempt))));
      }
    }
  }
  async function folderMetadata(id,signal){
    const p=new URLSearchParams({fields:'id,name,mimeType,parents,trashed',supportsAllDrives:'true'});
    return readDiscoveryMetadata('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?'+p,signal);
  }
  async function discoverLibraryRoots(signal){
    const baseline=state.baseFolderSources;
    if(!baseline.length)return [];
    const labels=[...new Set(baseline.map(f=>f.path.split('/')[0]))];
    const roots=[];
    for(const label of labels){
      const candidates=baseline.filter(f=>f.path.startsWith(label+'/'))
        .sort((a,b)=>a.path.split('/').length-b.path.split('/').length).slice(0,5);
      let found=null;
      for(const candidate of candidates){
        const segments=candidate.path.split('/');
        let cursor=candidate.id,valid=true,lastMeta=null;
        try{
          for(let i=segments.length-1;i>=0;i--){
            if(signal?.aborted)throw new Error('Discovery cancelled');
            if(!safeId(cursor)){valid=false;break;}
            const meta=await folderMetadata(cursor,signal);
            if(meta.id!==cursor||meta.mimeType!==DRIVE_FOLDER_MIME||meta.trashed||
               meta.name!==segments[i]){valid=false;break;}
            lastMeta=meta;
            if(i>0)cursor=meta.parents?.[0];
          }
        }catch(error){
          if(signal?.aborted)throw error;
          valid=false;
        }
        if(valid&&lastMeta?.name===label){found={id:lastMeta.id,path:label};break;}
      }
      if(!found)throw fullVerificationError('Could not verify the '+label+' library root from existing folder IDs.');
      roots.push(found);
    }
    return roots;
  }
  async function listFolderContents(folder,signal){
    const media=[],children=[],seenIds=new Set(),pages=new Set();
    let token='',pageCount=0,rawCount=0;
    do{
      if(signal?.aborted)throw new Error('Folder scan cancelled');
      if(++pageCount>40)throw new Error('Folder exceeded 40 Drive pages');
      const params=new URLSearchParams({
        q:"'"+folder.id+"' in parents and trashed = false",
        fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime)',
        pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'
      });
      if(token)params.set('pageToken',token);
      const data=await readDiscoveryMetadata('https://www.googleapis.com/drive/v3/files?'+params,signal);
      if(data.incompleteSearch||!Array.isArray(data.files))throw new Error('Drive returned an incomplete folder listing');
      rawCount+=data.files.length;
      if(rawCount>20000)throw new Error('Folder exceeded safe scan size limit');
      for(const item of data.files){
        if(!safeId(item.id)||seenIds.has(item.id))continue;
        seenIds.add(item.id);
        if(item.mimeType===DRIVE_FOLDER_MIME)children.push(item);
        else if(supportedMedia(item.mimeType))media.push(item);
      }
      const next=data.nextPageToken||'';
      if(next&&(pages.has(next)||next===token))throw new Error('Drive repeated a folder page token');
      if(next)pages.add(next);
      token=next;
    }while(token);
    return {media,children};
  }
  async function discoverFolderTree(signal){
    const roots=await discoverLibraryRoots(signal);
    const baseline=state.baseFolderSources;
    if(!roots.length)throw new Error('No library roots available for discovery');
    const byId=new Map(baseline.map(f=>[f.id,f]));
    const queue=roots.map(root=>({...root,depth:0})),seen=new Set(),pathSet=new Set();
    const sources=[],contents=new Map();
    let mediaTotal=0,completed=0;
    async function worker(){
      while(queue.length){
        if(signal?.aborted)throw new Error('Folder discovery cancelled');
        const next=queue.shift();
        if(seen.has(next.id))continue;
        seen.add(next.id);
        if(seen.size>MAX_DISCOVERED_FOLDERS)throw new Error('Folder discovery limit reached; no changes applied');
        const base=byId.get(next.id);
        const source={id:next.id,path:next.path,inventoryPath:base?.path||null,
          discovered:!base,missing:false};
        sources.push(source);pathSet.add(next.path);
        const result=await listFolderContents(next,signal);
        contents.set(next.path,result.media);
        mediaTotal+=result.media.length;
        if(mediaTotal>MAX_DISCOVERED_MEDIA)throw new Error('Library media safety limit reached; no changes applied');
        if(result.children.length&&next.depth>=MAX_DISCOVERY_DEPTH)
          throw new Error('Nested folder depth exceeds safe discovery limit');
        for(const child of result.children){
          if(seen.has(child.id)||queue.some(item=>item.id===child.id))continue;
          let path=next.path+'/'+displayFolderPart(child.name);
          if(pathSet.has(path)||queue.some(item=>item.path===path))path+=' ('+child.id.slice(-6)+')';
          queue.push({id:child.id,path,depth:next.depth+1});
          if(queue.length+seen.size>MAX_DISCOVERED_FOLDERS)
            throw new Error('Too many nested folders to scan safely');
        }
        completed++;
        updateScanSummary('Discovering collection folders… '+completed+' checked');
      }
    }
    await Promise.all([worker(),worker(),worker()]);
    for(const original of baseline){
      if(seen.has(original.id))continue;
      let path=original.path;
      if(pathSet.has(path))path+=' (missing '+original.id.slice(-6)+')';
      pathSet.add(path);
      sources.push({...original,path,inventoryPath:original.path,missing:true,discovered:false});
      contents.set(path,[]);
    }
    return {roots,sources,contents};
  }

  function mergeLiveFolders(recentPaths=new Set()){
    const scanned=new Set(state.syncedFolders.keys());
    const scannedInventoryPaths=new Set(state.folderSources
      .filter(source=>scanned.has(source.path)).map(source=>source.inventoryPath||source.path));
    const originals=new Map(state.inventory.map(item=>[item.id,item]));
    // Live locations win even if the source folder's scan failed or was not yet completed.
    const liveIDs=new Set([...state.syncedFolders.values()].flatMap(files=>files.map(file=>file.id)));
    const combined=state.inventory.filter(item=>!scannedInventoryPaths.has(item.folder)&&!liveIDs.has(item.id));
    const usedIDs=new Set(combined.map(item=>item.id));
    // When a folder scan failed, older cached locations must not override newer
    // successful observations of moved files in another folder.
    const ordered=[...state.syncedFolders.entries()].sort((a,b)=>
      Number(recentPaths.has(b[0]))-Number(recentPaths.has(a[0])));
    for(const [path, files] of ordered){
      for(const file of files){
        // A file moved between indexed folders keeps its identity, but must get its new folder.
        if(usedIDs.has(file.id))continue;
        usedIDs.add(file.id);
        const base=originals.get(file.id);
        combined.push(mediaContract.normalizeMediaRecord(base ? {...base,folder:path,collection:folderKind(path)==='memes'?'Memes':'Jacks Photos',
          name:file.name||base.name,mime:file.mimeType||base.mime,size:Number(file.size??base.size)}
        : {id:file.id,collection:folderKind(path)==='memes'?'Memes':'Jacks Photos',folder:path,
          name:file.name||'Untitled media',description:'',tags:'',captureDate:'',review:'New in Drive',
          confidence:'',category:'',mime:file.mimeType,size:Number(file.size||0),
          url:linkToDrive(file),demo:false,newInDrive:true}));
      }
    }
    state.images=combined;
    // Do not unexpectedly jump the user back to page one during background refresh.
    buildFolderIndex();updateStatus();render();
  }
  function updateScanSummary(message,error=false){
    $('syncStatus').textContent=message;
    $('syncStatus').classList.toggle('error',error);
  }
  async function listDriveChanges(token,signal){
    const changes=[],seen=new Set();
    let pageToken=token,page=0;
    while(true){
      if(signal?.aborted)throw new Error('Sync cancelled');
      if(++page>20)throw new Error('Too many changes pages. Use Full rescan.');
      if(seen.has(pageToken))throw new Error('Google repeated a changes page token.');
      seen.add(pageToken);
      const params=new URLSearchParams({
        pageToken,pageSize:'1000',includeRemoved:'true',includeItemsFromAllDrives:'true',
        supportsAllDrives:'true',
        fields:'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,parents,trashed,modifiedTime))'
      });
      const data=await googleGet(`https://www.googleapis.com/drive/v3/changes?${params.toString()}`,{signal});
      if(!Array.isArray(data.changes))throw new Error('Google returned invalid changes data.');
      changes.push(...data.changes);
      if(changes.length>15000)throw new Error('Too many changes. Use Full rescan.');
      if(data.nextPageToken){pageToken=data.nextPageToken;continue;}
      if(!data.newStartPageToken)throw new Error('No updated changes cursor returned. Use Full rescan.');
      return {changes,token:data.newStartPageToken};
    }
  }
  function fullVerificationError(message){
    const error=new Error(message);
    error.needsFullScan=true;
    return error;
  }
  function syncSucceeded(message,quiet){
    updateScanSummary(message,false);
    // Clear prior sync error banners after successfully reconciling Drive.
    if(state.syncErrorVisible){clearAlert();state.syncErrorVisible=false;}
    if(!quiet)alertUser(message,'success');
  }
  function syncFailed(message,quiet){
    updateScanSummary(message,true);
    if(!quiet){alertUser(message,'error');state.syncErrorVisible=true;}
  }
  async function resolveChangeFile(change,known,signal){
    let record=change.file;
    if(change.removed||record?.trashed)return {removed:true,record:null};
    if(record&&Array.isArray(record.parents))return {removed:false,record};
    // The Changes API can omit parents or the whole file resource, including
    // for unrelated files. Never let one missing parents field block deletions.
    if(!known&&(!record||(!supportedMedia(record.mimeType)&&record.mimeType!==DRIVE_FOLDER_MIME)))return {skip:true};
    const params=new URLSearchParams({
      fields:'id,name,mimeType,size,parents,trashed,modifiedTime',
      supportsAllDrives:'true'
    });
    try{
      record=await googleGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(change.fileId)}?${params}`,{signal});
    }catch(error){
      if(error.httpStatus===404)return {removed:true,record:null};
      // A change outside the watched folders may be inaccessible; it is not
      // evidence that any of our indexed files disappeared.
      if(!known&&error.httpStatus===403&&!error.retryable)return {skip:true};
      if(known&&error.httpStatus===403)throw fullVerificationError('A previously indexed file is no longer accessible. Verifying folder contents.');
      throw error;
    }
    if(record?.trashed)return {removed:true,record:null};
    if(!record||!Array.isArray(record.parents)){
      if(known)throw fullVerificationError('Google omitted a known file’s location. Verifying folder contents.');
      return {skip:true};
    }
    return {removed:false,record};
  }
  async function syncDriveChanges({quiet=false}={}){
    if(state.scanning||!state.connected||!state.changeToken)return;
    const generation=++state.scanGeneration,controller=new AbortController();
    const active=()=>state.connected&&state.scanGeneration===generation&&!controller.signal.aborted;
    state.scanController=controller;state.scanning=true;
    $('syncButton').disabled=true;$('healthScanButton').disabled=true;
    let mustVerify=false;
    try{
      updateScanSummary('Checking recent Drive changes…');
      const result=await listDriveChanges(state.changeToken,controller.signal);
      if(!active())return;
      // Only reconcile monitored folders. Do not use a Drive change to mutate
      // files outside the existing, user-selected image collection roots.
      const byFolderID=new Map(state.folderSources.map(f=>[f.id,f.path]));
      const monitoredFolders=new Set([...byFolderID.keys(),...state.libraryRoots.map(r=>r.id)]);
      const staged=new Map([...state.syncedFolders].map(([path,files])=>[path,files.slice()]));
      if(staged.size!==state.folderSources.length)throw fullVerificationError('Folder baseline is incomplete.');
      const affected=new Set(), trackedIDs=new Set([...staged.values()].flatMap(files=>files.map(f=>f.id)));
      let lookups=0,ignored=0;
      for(const change of result.changes){
        if(!active())return;
        if(!safeId(change.fileId))continue;
        const id=change.fileId, known=trackedIDs.has(id);
        const folderEvent=monitoredFolders.has(id)||change.file?.mimeType===DRIVE_FOLDER_MIME;
        if(folderEvent){
          // A folder can be created, moved, renamed, or removed. Its entire
          // descendant tree needs reconciliation before the change cursor moves.
          const candidate=await resolveChangeFile(change,monitoredFolders.has(id),controller.signal);
          if(!active())return;
          if(monitoredFolders.has(id) ||
             candidate.record?.parents?.some(p=>monitoredFolders.has(p))){
            throw fullVerificationError('A library folder changed. Rediscovering nested folders.');
          }
          ignored++;continue;
        }
        if(!change.removed && !change.file?.trashed &&
            (!change.file||!Array.isArray(change.file.parents)) &&
            (known||supportedMedia(change.file?.mimeType))){
          if(++lookups>MAX_AMBIGUOUS_LOOKUPS)throw fullVerificationError('Too many ambiguous file changes to verify individually.');
        }
        const resolved=await resolveChangeFile(change,known,controller.signal);
        if(!active())return;
        if(resolved.skip){ignored++;continue;}
        // Known changes are applied to a private staged snapshot only.
        // If any request fails, the visible gallery and sync cursor remain intact.
        for(const [path,files] of staged){
          const at=files.findIndex(f=>f.id===id);
          if(at>=0){files.splice(at,1);affected.add(path);}
        }
        const record=resolved.record;
        if(!resolved.removed && record && !record.trashed && supportedMedia(record.mimeType)){
          const target=record.parents.map(parent=>byFolderID.get(parent)).find(Boolean);
          if(target){
            staged.get(target).push({
              id,name:record.name||'Untitled media',mimeType:record.mimeType,
              size:record.size||0,modifiedTime:record.modifiedTime||''
            });
            affected.add(target);
          }
        }
      }
      if(!active())return;
      state.syncedFolders=staged;
      for(const path of affected){refreshFolderHealth(path);state.scanFailures.delete(path);}
      state.changeToken=result.token;state.lastScanAt=new Date().toISOString();
      if(affected.size)mergeLiveFolders(affected);
      rememberSyncCache();
      const summary=`Checked ${result.changes.length} Drive changes · ${affected.size} indexed folders updated${ignored?` · ${ignored} unrelated changes skipped`:''} · read-only`;
      syncSucceeded(summary,quiet);
    }catch(error){
      if(!active())return;
      mustVerify=!!error.needsFullScan||[400,410].includes(error.httpStatus);
      if(mustVerify){
        // The old token is not trustworthy until a complete file-ID comparison.
        state.changeToken=null;clearLocalSyncCache();
        updateScanSummary('Incremental sync needs verification. Checking every indexed folder…');
      }else{
        syncFailed(`Drive sync incomplete: ${error.message}. Existing files kept; retry or use Full rescan.`,quiet);
      }
    }finally{
      if(active()){
        state.scanning=false;state.scanController=null;
        $('syncButton').disabled=false;$('healthScanButton').disabled=false;
        if(state.view==='health')renderHealth();
      }
    }
    if(mustVerify&&active()){
      // Recover automatically rather than leaving deleted items visible forever.
      // Failed full scans retain prior data and clearly report affected folders.
      return syncWithDrive({quiet,full:true});
    }
  }

  async function syncWithDrive({quiet=false,full=false}={}){
    if(state.scanning||!state.connected)return;
    if(state.changeToken&&!full)return syncDriveChanges({quiet});
    if(!state.folderSources.length){updateScanSummary('No indexed folder IDs found in the Folders sheet.',true);return;}
    if(Date.now()>=state.expiry){if(!quiet)updateScanSummary('Google sign-in expired. Reconnect Drive.',true);return;}
    const generation=++state.scanGeneration;
    const controller=new AbortController();
    const active=()=>state.connected&&state.scanGeneration===generation&&!controller.signal.aborted;
    state.scanController=controller;
    state.scanning=true;
    $('syncButton').disabled=true;$('healthScanButton').disabled=true;
    const scannedPaths=new Set(),failures=[];
    state.scanFailures.clear();
    // Capture the starting cursor BEFORE scanning to avoid missing concurrent changes.
    let initialCursor=null;
    try{initialCursor=await startChangeCursor(controller.signal);}catch{initialCursor=null;}
    if(!active())return;
    // With a valid snapshot from the private Folders sheet, discover new child
    // directories under the verified library roots before scanning files.
    // Do not commit partial trees: one failed folder listing keeps the previous
    // gallery and cursor unchanged, with a clear error to retry.
    if(state.baseFolderSources.length){
      try{
        const discovery=await discoverFolderTree(controller.signal);
        if(!active())return;
        state.folderSources=discovery.sources;
        state.libraryRoots=discovery.roots;
        state.lastDiscoveryAt=new Date().toISOString();
        state.lastFallbackScanAt=null;
        state.discoveryError=null;
        state.syncedFolders=discovery.contents;
        state.health.clear();state.scanFailures.clear();
        for(const source of state.folderSources)refreshFolderHealth(source.path);
        const paths=new Set(state.folderSources.map(source=>source.path));
        mergeLiveFolders(paths);
        state.lastScanAt=new Date().toISOString();
        state.lastFullScanAt=state.lastScanAt;
        state.changeToken=initialCursor;
        if(initialCursor)rememberSyncCache();
        const added=state.images.filter(item=>item.newInDrive).length;
        const missing=[...state.health.values()].reduce((n,row)=>n+row.missing.length,0);
        const discovered=state.folderSources.filter(source=>source.discovered&&!discovery.roots.some(root=>root.id===source.id)).length;
        const message='Verified '+state.folderSources.length+' folders under '+discovery.roots.length+
          ' library roots · '+discovered+' new folders · '+added+' new media · '+missing+
          ' missing from inventory. Drive and spreadsheet unchanged.';
        syncSucceeded(message,quiet);
      }catch(error){
        if(!active())return;
        state.discoveryError=error?.message||String(error);
        if(state.libraryRoots.length){
          // Preserve a previously verified tree instead of replacing it with
          // an incomplete folder listing after a temporary Drive failure.
          syncFailed('Folder discovery incomplete: '+state.discoveryError+
            '. Previous verified gallery retained; retry Full rescan.',quiet);
        }else{
          // First-run safety fallback: refresh the existing spreadsheet folders
          // even when Google temporarily cannot resolve their parent hierarchy.
          // No new folders are claimed and no change cursor is advanced.
          try{
            const source=state.baseFolderSources.slice(),results=new Map();
            let index=0;
            async function scanKnown(){
              while(index<source.length){
                const folder=source[index++];
                const files=await listKnownFolder(folder,controller.signal);
                if(!active())return;
                results.set(folder.path,files);
              }
            }
            await Promise.all([scanKnown(),scanKnown(),scanKnown()]);
            if(!active())return;
            state.folderSources=source;
            state.syncedFolders=results;
            state.health.clear();state.scanFailures.clear();
            for(const folder of source)refreshFolderHealth(folder.path);
            mergeLiveFolders(new Set(source.map(folder=>folder.path)));
            state.lastScanAt=new Date().toISOString();
            state.lastFallbackScanAt=state.lastScanAt;
            state.lastFullScanAt=null;
            state.changeToken=null;clearLocalSyncCache();
            syncFailed('Existing indexed folders verified, but new folder discovery is unavailable: '+
              state.discoveryError+'. Full discovery can be retried.',quiet);
          }catch(fallbackError){
            if(!active())return;
            syncFailed('Folder discovery and indexed-folder verification failed: '+
              state.discoveryError+'; '+(fallbackError?.message||fallbackError)+
              '. Previous gallery retained.',quiet);
          }
        }
      }finally{
        if(active()){
          state.scanning=false;state.scanController=null;
          $('syncButton').disabled=false;$('healthScanButton').disabled=false;
          if(state.view==='health')renderHealth();
        }
      }
      return;
    }
    const folderQueue=state.folderSources.slice();
    let done=0;
    async function worker(){
      while(folderQueue.length && active()){
        const folder=folderQueue.shift();
        try{
          const files=await listKnownFolder(folder,controller.signal);
          if(!active())return;
          // A folder updates only after ALL pages completed successfully.
          state.syncedFolders.set(folder.path,files);
          scannedPaths.add(folder.path);
          refreshFolderHealth(folder.path);
        }catch(error) {
          if(!active())return;
          const message=error?.message||String(error);
          failures.push(`${folder.path}: ${message}`);
          state.scanFailures.set(folder.path,message);
        }finally{
          if(active()) {done++;updateScanSummary(`Checking Drive folders… ${done}/${state.folderSources.length}`);}
        }
      }
    }
    try{
      await Promise.all([worker(),worker(),worker()]);
      if(!active())return;
      if(scannedPaths.size){mergeLiveFolders(scannedPaths);state.lastScanAt=new Date().toISOString();}
      if(!failures.length && scannedPaths.size===state.folderSources.length){
        state.changeToken=initialCursor;
        state.lastFullScanAt=state.lastScanAt;
        if(state.changeToken)rememberSyncCache();
      }else{
        // A partial baseline cannot safely advance a changes cursor.
        state.changeToken=null;clearLocalSyncCache();
      }
      const current=[...scannedPaths].map(path=>state.health.get(path)).filter(Boolean);
      const added=current.reduce((n,f)=>n+f.added.length,0);
      const missing=current.reduce((n,f)=>n+f.missing.length,0);
      const summary=`Verified ${scannedPaths.size}/${state.folderSources.length} Drive folders · ${added} new · ${missing} missing from inventory${failures.length?` · ${failures.length} failed`:''}. Missing files are hidden from the gallery; originals unchanged.`;
      if(failures.length)syncFailed(summary,quiet);
      else syncSucceeded(summary,quiet);
    }finally{
      if(active()){
        state.scanning=false;state.scanController=null;
        $('syncButton').disabled=false;$('healthScanButton').disabled=false;
        if(state.view==='health')renderHealth();
      }
    }
  }

  function renderHealth(){
    const verified=!!state.lastFullScanAt&&state.syncedFolders.size===state.folderSources.length;
    const snapshotIDs=new Set(state.inventory.map(item=>item.id));
    const liveIDs=new Set(state.images.filter(item=>!item.demo).map(item=>item.id));
    const additions=verified?[...liveIDs].filter(id=>!snapshotIDs.has(id)).length:null;
    const missing=verified?[...snapshotIDs].filter(id=>!liveIDs.has(id)).length:null;
    $('metricSnapshot').textContent=format(state.inventory.length);
    $('metricLive').textContent=verified?format(liveIDs.size):'—';
    $('metricAdded').textContent=verified?format(additions):'—';
    $('metricMissing').textContent=verified?format(missing):'—';
    $('metricLiveNote').textContent=verified?'Verified against Drive':'Awaiting full verification';

    const newFolders=state.folderSources.filter(source=>source.discovered&&!state.libraryRoots.some(r=>r.id===source.id));
    const changedFolders=state.folderSources.filter(source=>source.inventoryPath&&source.inventoryPath!==source.path&&!source.missing);
    const missingFolders=state.folderSources.filter(source=>source.missing);
    const roots=state.libraryRoots.length?state.libraryRoots.map(root=>root.path).join(' + '):'Not verified';
    $('discoverySummary').textContent=state.discoveryError?
      'Folder discovery incomplete: '+state.discoveryError+'. Previous verified files retained.' :
      'Watched roots: '+roots+' · '+newFolders.length+' newly discovered subfolders · '+
      changedFolders.length+' renamed or relocated indexed folders · '+missingFolders.length+
      ' indexed folders no longer beneath the roots.';

    const checked=state.lastScanAt?new Date(state.lastScanAt).toLocaleString():'Never';
    const full=state.lastFullScanAt?new Date(state.lastFullScanAt).toLocaleString():'Never';
    $('healthSummary').textContent='Original spreadsheet: '+format(state.inventory.length)+' media in '+
      state.baseFolderSources.length+' indexed folders · Watched live folders: '+
      state.folderSources.length+' · Last Drive change check: '+checked+' · Last full folder verification: '+full+
      (state.scanning?' · Scan in progress…':'');

    const data=[...state.health.values()].filter(row=>!state.scanFailures.has(row.folder));
    const rows=state.folderSources.map(folder=>{
      const row=state.health.get(folder.path),failure=state.scanFailures.get(folder.path);
      const status=failure?'Scan failed: '+failure:
        !row?'Not verified':
        (folder.missing?'Folder no longer under library root · ':
         folder.discovered?'Discovered from Drive · ':
         folder.inventoryPath!==folder.path?'Moved or renamed · ':'')+
        row.added.length+' new · '+row.missing.length+' missing';
      const name=folder.path+(folder.inventoryPath&&folder.inventoryPath!==folder.path?
        ' (was '+folder.inventoryPath+')':'');
      return '<tr><td>'+escapeHTML(name)+'</td><td>'+format(row?.sourceCount??state.inventory.filter(x=>x.folder===(folder.inventoryPath||folder.path)).length)+
        '</td><td>'+(row?format(row.driveCount):'—')+'</td><td>'+escapeHTML(status)+'</td></tr>';
    });
    $('healthRows').innerHTML=rows.join('');
    const changed=data.filter(row=>row.added.length||row.missing.length);
    const lines=changed.flatMap(folder=>[
      ...folder.added.map(item=>'<li><span class="health-added">NEW</span> '+
        escapeHTML(item.name)+' <small>'+escapeHTML(folder.folder)+'</small></li>'),
      ...folder.missing.map(item=>'<li><span class="health-missing">MISSING</span> '+
        escapeHTML(item.name)+' <small>'+escapeHTML(folder.folder)+'</small></li>')
    ]);
    $('healthChanges').innerHTML=lines.length?lines.slice(0,200).join('')+
      (lines.length>200?'<li>Showing first 200 differences. Narrow your scan or export the inventory for a complete comparison.</li>':''):
      '<li>No file differences recorded in verified folders.</li>';
  }

  function clearThumbnailCache() {
    state.galleryEpoch++;
    state.thumbJobs = [];
    for (const controller of state.activeControllers) controller.abort();
    state.activeControllers.clear(); state.loadingThumbs.clear();
    for (const entry of state.thumbCache.values()) if (entry?.objectUrl) URL.revokeObjectURL(entry.src);
    state.thumbCache.clear(); state.thumbErrors.clear();state.posterError.clear();
    videoClearStoryboard();
    if (state.observer) {state.observer.disconnect();state.observer=null;}
  }
  function disconnect() {
    // Clear access and all in-memory image data. Favorites store IDs only on this device.
    const token = state.accessToken;
    state.accessToken = null; state.expiry=0; state.connected=false; state.tokenClient=null;
    saveBrowsingPosition();
    stopScans();stopVideo();state.videoSessionEvidence.clear();clearBrowsingPosition();clearLocalSyncCache();state.inventory=[];state.folderSources=[];state.baseFolderSources=[];state.libraryRoots=[];state.lastDiscoveryAt=null;state.lastFallbackScanAt=null;state.discoveryError=null;state.syncedFolders.clear();state.health.clear();state.scanFailures.clear();state.lastScanAt=null;state.changeToken=null;state.driveIdentity=null;state.lastFullScanAt=null;
    if (token && window.google?.accounts?.oauth2?.revoke) google.accounts.oauth2.revoke(token, () => {});
    clearThumbnailCache(); state.reviewEdits.clear();state.savedSearches=[];state.activeSavedSearch='';state.smartCollections=[];state.smartCollectionId='';state.smartStorageHealthy=true;state.memoryYear='all';state.memorySource='all';state.memorySelection={key:'all',source:'all'};state.reviewDirty=false;state.reviewFilter='pending';state.images=DEMO; state.folder='all'; state.page=1;buildFolderIndex(); updateStatus(); displayPage('home');
    alertUser('Disconnected. Your private images and access token have been cleared from this tab.', 'success');
  }
  function buildFolderIndex() {
    const map = new Map();
    for (const image of state.images) {
      const folder = image.folder;
      if (!map.has(folder)) map.set(folder,{path:folder,name:folderName(folder),kind:folderKind(folder),count:0,described:0});
      const record=map.get(folder);record.count++;if(image.description)record.described++;
    }
    // Make newly discovered empty albums visible in the collection picker too.
    if(state.connected){
      for(const source of state.folderSources){
        if(!source.discovered||source.missing||state.libraryRoots.some(root=>root.id===source.id)||map.has(source.path))continue;
        map.set(source.path,{path:source.path,name:folderName(source.path),kind:folderKind(source.path),count:0,described:0});
      }
    }
    state.folders = [...map.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
  }
  /* GENERATED VIDEO CONTROLLER START */
  function videoSession(item){
    return state.videoSessionEvidence.get(item?.id)||{};
  }
  function videoEvidenceMessage(item){
    const e=videoLibrary.videoEvidence(item,videoSession(item));
    const source=e.origin==='manifest'?'Source: Manifest':e.origin==='session'?'Source: session-only preview':'No verified visual evidence';
    return e.label+' · '+source+' · '+e.playback+'. '+e.audio;
  }
  function videoUpdateEvidence(item){
    $('videoEvidenceStatus').textContent=item&&mediaKind(item)==='video'?videoEvidenceMessage(item):'';
    $('videoEvidenceStatus').classList.toggle('hidden',!item||mediaKind(item)!=='video');
  }
  function videoRenderCatalog(){
    const all=state.connected?state.images:[];
    const count=all.filter(x=>mediaKind(x)==='video').length;
    const listing=videoLibrary.videoList(all,{filter:state.videoLibraryFilter,page:state.videoLibraryPage});
    state.videoLibraryPage=Math.min(listing.page,listing.pageCount);
    $('videoCatalogSummary').textContent=state.connected?
      format(count)+' video files · '+format(listing.total)+' match this filter · page '+
      listing.page+' of '+listing.pageCount:
      'Connect Drive to inspect videos already indexed in your private Google Sheet.';
    $('videoCatalogFilter').value=state.videoLibraryFilter;
    $('videoCatalogPrev').disabled=listing.page<=1;
    $('videoCatalogNext').disabled=listing.page>=listing.pageCount;
    $('videoCatalogList').innerHTML=listing.entries.length?listing.entries.map(item=>{
      const ev=videoLibrary.videoEvidence(item);
      const preview=videoLibrary.videoEligibility(item,{operation:'storyboard'});
      const reason=preview.allowed?'Storyboard available on request (12 MB max)':preview.reason;
      return '<article class="video-library-card"><div class="video-library-glyph" aria-hidden="true">▶</div>'+
        '<div class="video-library-card-body"><strong>'+escapeHTML(item.name)+'</strong><p>'+
        escapeHTML(item.folder||'Unknown folder')+'</p><small>'+escapeHTML(videoLibrary.videoFormat(item))+
        ' · '+escapeHTML(humanBytes(item.size))+'</small>'+
        '<p class="video-library-evidence">'+escapeHTML(ev.label)+' · '+escapeHTML(ev.origin)+'</p>'+
        '<p class="video-library-limit">'+escapeHTML(reason)+'</p>'+
        '<div class="video-library-actions"><button type="button" class="btn outline" data-video-open="'+
        escapeHTML(item.id)+'">Open video details</button><a class="btn quiet" target="_blank" rel="noopener noreferrer" href="'+
        escapeHTML(linkToDrive(item))+'">Open in Drive</a></div></div></article>';
    }).join(''):
      '<p class="video-library-empty">No videos match this filter. No source files have been changed.</p>';
    $('videoCatalogList').querySelectorAll('[data-video-open]').forEach(btn=>
      btn.addEventListener('click',()=>{
        const item=state.images.find(x=>x.id===btn.dataset.videoOpen);
        if(!item)return;
        state.filtered=state.images.filter(x=>mediaKind(x)==='video');
        openImage(item.id,btn);
      }));
  }
  function videoClearStoryboard(){
    state.storyboardController?.abort();
    state.storyboardController=null;
    for(const frame of state.storyboardFrames)if(frame.url)URL.revokeObjectURL(frame.url);
    state.storyboardFrames=[];
    state.storyboardWorkingId=null;
    $('storyboardPanel').classList.add('hidden');
    $('storyboardFrames').replaceChildren();
    $('storyboardStatus').textContent='';
    $('storyboardButton').disabled=false;
    $('storyboardCancel').classList.add('hidden');
  }
  function videoFrameWait(video,event,signal,timeout=8000){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted)return reject(new Error('Video sampling cancelled'));
      let done=false,timer;
      const finish=(error)=>{
        if(done)return;
        done=true;clearTimeout(timer);
        video.removeEventListener(event,onReady);
        video.removeEventListener('error',onError);
        signal?.removeEventListener('abort',onAbort);
        error?reject(error):resolve();
      };
      const onReady=()=>finish(),onError=()=>finish(new Error('Unsupported or malformed video content'));
      const onAbort=()=>finish(new Error('Video sampling cancelled'));
      timer=setTimeout(()=>finish(new Error('Video decoder timed out')),timeout);
      video.addEventListener(event,onReady,{once:true});
      video.addEventListener('error',onError,{once:true});
      signal?.addEventListener('abort',onAbort,{once:true});
    });
  }
  async function videoCheckSignature(source,item){
    const header=new Uint8Array(await source.slice(0,32).arrayBuffer());
    if(!videoLibrary.videoValidateSignature(header,item))
      throw new Error('The downloaded video has an invalid or unexpected MP4/WebM header. Open in Drive.');
  }
  async function videoMakeStoryboard(source,item,signal){
    await videoCheckSignature(source,item);
    if(signal.aborted)throw new Error('Video sampling cancelled');
    const mediaUrl=URL.createObjectURL(new Blob([source],{type:item.mime}));
    const video=document.createElement('video');
    video.muted=true;video.playsInline=true;video.preload='metadata';
    const frames=[];
    try{
      const metadata=videoFrameWait(video,'loadedmetadata',signal);
      video.src=mediaUrl;video.load();
      await metadata;
      if(!video.videoWidth||!video.videoHeight||video.videoWidth>videoLibrary.VIDEO_MAX_DIMENSION||
         video.videoHeight>videoLibrary.VIDEO_MAX_DIMENSION||
         video.videoWidth*video.videoHeight>videoLibrary.VIDEO_MAX_PIXELS)
        throw new Error('Video dimensions exceed the safe storyboard decode limit');
      const times=videoLibrary.videoStoryboardTimes(video.duration);
      const canvas=document.createElement('canvas');
      const scale=Math.min(1,320/video.videoWidth,180/video.videoHeight);
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
      canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Canvas video preview is unavailable');
      for(const time of times){
        if(signal.aborted)throw new Error('Video sampling cancelled');
        const seek=videoFrameWait(video,'seeked',signal);
        video.currentTime=time;
        await seek;
        if(signal.aborted)throw new Error('Video sampling cancelled');
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const still=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.73));
        if(!still)throw new Error('Browser could not encode a storyboard frame');
        frames.push({time,blob:still,width:video.videoWidth,height:video.videoHeight});
      }
      return frames;
    }finally{
      video.pause();video.removeAttribute('src');video.load();
      URL.revokeObjectURL(mediaUrl);
    }
  }
  function videoShowStoryboard(){
    const item=state.activeImage;
    if(!item||!state.storyboardFrames.length||state.storyboardWorkingId!==item.id)return;
    $('storyboardPanel').classList.remove('hidden');
    $('storyboardStatus').textContent='Three sampled frames only · not a full video or audio review.';
    $('storyboardFrames').innerHTML=state.storyboardFrames.map((frame,i)=>
      '<figure class="video-frame"><img src="'+escapeHTML(frame.url)+'" alt="Sample '+(i+1)+
      ' from video at '+frame.time.toFixed(1)+' seconds"><figcaption>'+
      escapeHTML(frame.time.toFixed(1))+' s · '+escapeHTML(frame.width+' × '+frame.height)+
      ' px source</figcaption></figure>').join('');
  }
  async function videoGenerateStoryboard(){
    const item=state.activeImage;
    if(!item||mediaKind(item)!=='video'||item.demo||state.storyboardController)return;
    const probe=document.createElement('video');
    const canPlay=!!probe.canPlayType?.(item.mime||'');
    const eligible=videoLibrary.videoEligibility(item,{operation:'storyboard',canPlay});
    if(!eligible.allowed){$('previewDetails').textContent=eligible.reason;return;}
    videoClearStoryboard();
    const controller=new AbortController();
    state.storyboardController=controller;
    state.storyboardWorkingId=item.id;
    $('storyboardButton').disabled=true;
    $('storyboardCancel').classList.remove('hidden');
    $('storyboardPanel').classList.remove('hidden');
    $('storyboardStatus').textContent='Downloading a bounded video and sampling three frames…';
    try{
      const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+
        '?alt=media&supportsAllDrives=true';
      const source=await googleGet(url,{blob:true,maxBytes:videoLibrary.VIDEO_STORYBOARD_MAX,signal:controller.signal});
      if(controller.signal.aborted||state.storyboardController!==controller||state.activeImage?.id!==item.id)return;
      const frames=await videoMakeStoryboard(source,item,controller.signal);
      if(controller.signal.aborted||state.storyboardController!==controller||state.activeImage?.id!==item.id)return;
      state.storyboardFrames=frames.map(x=>({...x,url:URL.createObjectURL(x.blob),blob:null}));
      const old=videoSession(item);
      state.videoSessionEvidence.set(item.id,{...old,sampledFrames:frames.length});
      videoShowStoryboard();
      videoUpdateEvidence(item);
      renderMediaDiagnostic(item);
    }catch(error){
      if(!controller.signal.aborted&&state.activeImage?.id===item.id){
        $('storyboardStatus').textContent='Could not sample this video: '+
          (error?.message||'Unknown decoder error')+'. Open in Drive instead.';
      }
    }finally{
      if(state.storyboardController===controller){
        state.storyboardController=null;
        $('storyboardButton').disabled=false;
        $('storyboardCancel').classList.add('hidden');
      }
    }
  }
  /* GENERATED VIDEO CONTROLLER END */
  function displayPage(view,{reset=true,scroll=true}={}) {
    if(state.connected&&browsingView())saveBrowsingPosition();
    if(view==='home'||view==='health'||view==='smart'||view==='memory'||view==='video-library'){
      state.autoLoadObserver?.disconnect();
      state.autoLoadObserver=null;
      state.galleryRevision++;
    }
    state.view=view;
    if(view!=='smart-results')state.smartCollectionId='';
    if(reset){
      state.folder='all';state.folderQuery='';state.page=1;
      if($('folderSearch'))$('folderSearch').value='';
    }
    $('homeView').classList.toggle('hidden',view!=='home');
    $('galleryView').classList.toggle('hidden',view==='home'||view==='health'||view==='smart'||view==='memory'||view==='video-library');
    $('videoLibraryView').classList.toggle('hidden',view!=='video-library');
    $('memoryView').classList.toggle('hidden',view!=='memory');
    $('smartView').classList.toggle('hidden',view!=='smart');
    $('healthView').classList.toggle('hidden',view!=='health');
    document.querySelectorAll('[data-view]').forEach(btn=>{const active=btn.dataset.view===(view==='smart-results'?'smart':view==='memory-results'?'memory':view); btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
    render();
    if(scroll)window.scrollTo({top:0,behavior:'smooth'});
    updateScrollControls();
  }
  function render() {if(state.view==='home')renderHome();else if(state.view==='health')renderHealth();else if(state.view==='smart')renderSmartCollections();else if(state.view==='memory')renderMemoryLane();else if(state.view==='video-library')videoRenderCatalog();else renderGallery();}
  function renderHome() {
    const count = key => state.connected ? format(key) : '—';
    $('statImages').textContent=count(state.images.length);
    $('statMemes').textContent=count(state.images.filter(x=>folderKind(x.folder)==='memes').length);
    $('statPhotos').textContent=count(state.images.filter(x=>folderKind(x.folder)==='photos').length);
    $('statDescribed').textContent=count(state.images.filter(x=>!!effectiveDescription(x).trim()).length);
    // Featured collections are selected from the private inventory at runtime.
    // Never bake personal folder names into a public GitHub application bundle.
    const featured = state.connected ? [
      ...state.folders.filter(f=>f.kind==='memes').slice(0,2),
      ...state.folders.filter(f=>f.kind==='photos').slice(0,2)
    ] : [
      {path:'Preview/Memes',name:'Meme collections',kind:'memes',count:0},
      {path:'Preview/Photos',name:'Photo albums',kind:'photos',count:0},
      {path:'Preview/Explore',name:'Discover',kind:'memes',count:0},
      {path:'Preview/Favorites',name:'Favorites',kind:'photos',count:0}
    ];
    $('featuredCollections').innerHTML = featured.map(folder=>{
      const style=folderStyle(folder.path);
      return `<button class="collection-card" data-collection="${escapeHTML(folder.path)}" type="button"><div class="collection-art ${style.kind}"><span>${escapeHTML(style.icon)}</span></div><div class="collection-content"><strong>${escapeHTML(folder.name)} ↗</strong><small>${state.connected ? `${format(folder.count)} media files` : 'Connect Drive to browse'}</small></div></button>`;
    }).join('');
    $('featuredCollections').querySelectorAll('[data-collection]').forEach(btn=>btn.addEventListener('click',()=>{
      const folder=state.folders.find(f=>f.path===btn.dataset.collection);
      displayPage(folder ? folder.kind : 'all'); if(folder){state.folder=folder.path;renderGallery();}
    }));
  }
  function filterImages() {
    const parsed=searchEngine.parseSearchQuery(state.search);
    const scored=[];
    for(const image of state.images){
      const kind=folderKind(image.folder);
      if(state.view==='memes'&&kind!=='memes')continue;
      if(state.view==='photos'&&kind!=='photos')continue;
      if(state.view==='favorites'&&!state.favorites.has(image.id))continue;
      if(state.view==='review'){
        const stage=reviewStage(image);
        if(state.reviewFilter==='pending'&&stage!=='pending')continue;
        if(state.reviewFilter==='deferred'&&stage!=='deferred')continue;
        if(state.reviewFilter==='reviewed'&&stage!=='reviewed')continue;
      }
      if(state.view==='smart-results'&&!smartFor(image).matched)continue;
      if(state.view==='memory-results'&&!memoryEngine.memoryMatches(image,state.memorySelection,new Date()))continue;
      if(state.folder!=='all'&&image.folder!==state.folder)continue;
      if(state.mediaType!=='all'&&mediaKind(image)!==state.mediaType)continue;
      const rank=searchEngine.searchRank(image,parsed,{
        description:effectiveDescription(image),tags:effectiveTags(image),
        favorite:state.favorites.has(image.id),review:reviewStage(image)
      });
      if(rank!==null)scored.push({image,rank});
    }
    scored.sort((a,b)=>{
      if(state.sort==='relevance'&&state.search.trim())return b.rank-a.rank||
        a.image.name.localeCompare(b.image.name)||a.image.id.localeCompare(b.image.id);
      if(state.sort==='date-desc')return String(state.view==='memory-results'?memoryEngine.memoryEvidence(b.image).day:b.image.captureDate||'').localeCompare(String(state.view==='memory-results'?memoryEngine.memoryEvidence(a.image).day:a.image.captureDate||''))||
        a.image.name.localeCompare(b.image.name);
      if(state.sort==='date-asc')return String(state.view==='memory-results'?memoryEngine.memoryEvidence(a.image).day||'9999':a.image.captureDate||'9999').localeCompare(String(state.view==='memory-results'?memoryEngine.memoryEvidence(b.image).day||'9999':b.image.captureDate||'9999'))||
        a.image.name.localeCompare(b.image.name);
      if(state.sort==='review')return Number(!!b.image.description)-Number(!!a.image.description)||
        a.image.name.localeCompare(b.image.name);
      return a.image.name.localeCompare(b.image.name)||a.image.id.localeCompare(b.image.id);
    });
    return scored.map(x=>x.image);
  }
  function galleryTitle() {if(state.view==='memory-results')return memoryTitle();if(state.view==='smart-results')return currentSmartCollection()?.name||'Smart Collection';return ({all:'All media',memes:'Meme gallery',photos:'Photo archive',favorites:'Your favorites',review:'Needs review'})[state.view]||'Gallery';}
  function bindGalleryTileEvents(previews,hearts){
    for(const btn of previews)btn.addEventListener('click',()=>openImage(btn.dataset.openImage,btn));
    for(const btn of hearts)btn.addEventListener('click',e=>{
      e.preventDefault();toggleFavorite(btn.dataset.favorite);renderGallery();
    });
  }
  function updateLoadMoreArea(){
    state.autoLoadObserver?.disconnect();
    state.autoLoadObserver=null;
    const area=$('loadMoreArea');
    const remaining=state.filtered.length-state.renderedCount;
    if(remaining<=0){
      area.innerHTML=state.filtered.length?'<span class="autoload-complete">End of collection</span>':'';
      return;
    }
    if(!state.autoLoad||!('IntersectionObserver' in window)){
      area.innerHTML=`<button class="btn outline" id="loadMoreButton" type="button">Load more · ${format(remaining)} remaining</button>`;
      $('loadMoreButton').onclick=appendGalleryBatch;
      return;
    }
    const revision=state.galleryRevision;
    area.innerHTML=`<div id="autoLoadSentinel" class="autoload-sentinel" aria-hidden="true"></div><span class="autoload-progress">Showing ${format(state.renderedCount)} of ${format(state.filtered.length)} · more appear as you scroll</span>`;
    state.autoLoadObserver=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting)||state.autoLoadPending||revision!==state.galleryRevision)return;
      if(document.visibilityState==='hidden'||state.view==='home'||state.view==='health')return;
      state.autoLoadPending=true;
      // One batch per tick. Do not aggressively queue every remaining image.
      setTimeout(()=>{
        state.autoLoadPending=false;
        if(revision!==state.galleryRevision||!state.autoLoad||state.view==='home'||state.view==='health')return;
        appendGalleryBatch();
      },80);
    },{rootMargin:'500px 0px'});
    state.autoLoadObserver.observe($('autoLoadSentinel'));
  }
  function appendGalleryBatch(){
    if(state.renderedCount>=state.filtered.length)return false;
    const previous=state.renderedCount;
    const next=Math.min(previous+state.pageSize,state.filtered.length);
    const added=state.filtered.slice(previous,next);
    $('galleryGrid').insertAdjacentHTML('beforeend',added.map(tileHTML).join(''));
    state.renderedCount=next;
    state.page=Math.max(1,Math.ceil(next/state.pageSize));
    $('browseProgress').textContent=`Showing ${format(next)} of ${format(state.filtered.length)}`;
    scheduleBrowseSave();
    const previews=[...$('galleryGrid').querySelectorAll('[data-open-image]')].slice(previous);
    const hearts=[...$('galleryGrid').querySelectorAll('[data-favorite]')].slice(previous);
    bindGalleryTileEvents(previews,hearts);
    if(state.observer){
      for(const btn of previews)state.observer.observe(btn);
    }else if(state.connected&&!('IntersectionObserver' in window)){
      for(const btn of previews.slice(0,12)){
        const item=state.filtered.find(x=>x.id===btn.dataset.openImage);
        if(item)requestThumb(item);
      }
    }
    updateLoadMoreArea();
    updatePreviewStats();
    return true;
  }
  function renderGallery() {
    state.galleryRevision++;
    state.autoLoadObserver?.disconnect();state.autoLoadObserver=null;
    state.autoLoadPending=false;
    const title=galleryTitle();$('galleryTitle').textContent=title;
    $('backSmartCollections').classList.toggle('hidden',state.view!=='smart-results');
    $('backMemoryLane').classList.toggle('hidden',state.view!=='memory-results');
    renderReviewToolbar();
    $('galleryEyebrow').textContent=state.connected?'YOUR PRIVATE LIBRARY':'DESIGN PREVIEW';
    $('galleryDescription').textContent=state.connected ?
      state.view==='memory-results'?'Timeline grouped by evidence: EXIF, filename-derived, or Drive-added (not necessarily captured). No files moved.':
      state.view==='smart-results'?'Virtual collection · '+smartEngine.smartExplain(currentSmartCollection())+'. Original Drive files stay put.':
      state.view==='review'?'Only unresolved visual reviews appear here. Missing EXIF dates and duplicate decisions remain separate in your Sheet.':
      'Search the current Drive library. Previews load as you scroll.' :
      'Connect Google Drive to load your real collections and thumbnails.';
    $('galleryGrid').classList.toggle('list',state.layout==='list');
    $('galleryGrid').dataset.density=state.density;
    $('densitySelect').value=state.density;
    $('sortSelect').value=state.sort;
    renderSavedSearches();
    const parsedSearch=searchEngine.parseSearchQuery(state.search);
    $('searchHelp').textContent=parsedSearch.errors.length?parsedSearch.errors.join(' · '):
      'Search tips: "exact phrase" · tag:cat · type:video · folder:"Memes/Cats" · after:2025-01-01';
    $('searchHelp').classList.toggle('error',parsedSearch.errors.length>0);
    $('layoutButton').textContent=state.layout==='grid'?'☷':'▦';
    $('layoutButton').setAttribute('aria-label',state.layout==='grid'?'Switch to list view':'Switch to grid view');
    const available=state.folders.filter(f=>state.view==='all'||state.view==='review'||state.view==='favorites'||f.kind===state.view);
    const query=state.folderQuery.trim().toLocaleLowerCase();
    const matched=available.filter(f=>!query||f.path.toLocaleLowerCase().includes(query));
    // Preserve the selected option even while typing an unrelated query.
    const selected=available.find(f=>f.path===state.folder);
    const options=selected&&!matched.some(f=>f.path===selected.path)?[selected,...matched]:matched;
    $('folderSelect').innerHTML='<option value="all">All collections</option>'+
      options.map(f=>`<option value="${escapeHTML(f.path)}">${escapeHTML(f.name)} (${format(f.count)})</option>`).join('');
    $('folderSelect').value=state.folder;
    $('folderPickerCount').textContent=query?`${matched.length} collections found`:`${available.length} collections`;
    state.filtered=filterImages();const items=state.filtered.slice(0,state.page*state.pageSize);
    state.renderedCount=items.length;
    $('resultCount').textContent=`${format(state.filtered.length)} ${state.connected?'files':'samples'}`;
    $('browseProgress').textContent=`Showing ${format(items.length)} of ${format(state.filtered.length)}`;
    const notice=$('galleryNotice');notice.classList.toggle('hidden',state.connected);
    if(!state.connected) notice.textContent='Preview mode only. No private photo or file IDs are bundled with this application.';
    // Cancel queued work for images no longer on screen instead of wasting API quota.
    const visibleIds=new Set(items.map(i=>i.id));if(state.activeImage)visibleIds.add(state.activeImage.id);
    state.thumbJobs=state.thumbJobs.filter(job=>{
      if (visibleIds.has(job.id)) return true;
      state.loadingThumbs.delete(job.id);return false;
    });
    if(!items.length){$('galleryGrid').innerHTML=`<div class="empty-state"><span>⌕</span><strong>${state.view==='review'&&state.reviewFilter==='pending'?'All caught up!':'No media found'}</strong><p>${state.view==='favorites'?'Favorite an image in its detail view to collect it here.':state.view==='review'?'Try another review status, or narrow the search.':'Try another search or collection, or connect your Drive.'}</p></div>`;}
    else $('galleryGrid').innerHTML=items.map(tileHTML).join('');
    bindGalleryTileEvents(
      $('galleryGrid').querySelectorAll('[data-open-image]'),
      $('galleryGrid').querySelectorAll('[data-favorite]')
    );
    observeThumbs();
    updateLoadMoreArea();
    updatePreviewStats();
    scheduleBrowseSave();
  }
  function updatePreviewStats() {
    const visible=state.filtered.slice(0,state.page*state.pageSize).filter(x=>mediaKind(x)!=='pdf');
    const cached=visible.filter(x=>state.thumbCache.has(x.id)).length;
    const failed=visible.filter(x=>state.thumbErrors.has(x.id)).length;
    $('previewStatus').textContent=state.connected ? `${cached} of ${visible.length} previews ready${failed?` · ${failed} unavailable`:''}` : '';
    $('retryFailedButton').classList.toggle('hidden',!state.connected||!failed);
  }
  function tileHTML(item) {
    const style=folderStyle(item.folder),favorite=state.favorites.has(item.id),kind=mediaKind(item);
    const date=item.captureDate?item.captureDate.slice(0,10):folderName(item.folder);
    const error=state.thumbErrors.get(item.id),description=effectiveDescription(item);
    const status=reviewStage(item),note=state.reviewEdits.get(item.id);
    const badge=item.demo?'SAMPLE':status==='reviewed'?'REVIEWED':status==='deferred'?'LATER':
      status==='pending'?'NEEDS REVIEW':kind==='video'?(item.mime==='video/webm'?'WEBM':'VIDEO'):
      kind==='pdf'?'PDF':isGIF(item)?'GIF':'DESCRIBED';
    const badgeClass=(status==='reviewed'||status==='source-reviewed')&&!item.demo?'reviewed':
      status==='deferred'?'deferred':'';
    const why=state.view==='smart-results'?smartFor(item).reasons.join(' · '):'';
    const when=state.view==='memory-results'?memorySourceLabel(item):'';
    return `<article class="image-tile"><button class="tile-preview" type="button" data-open-image="${escapeHTML(item.id)}" aria-label="View ${escapeHTML(item.name)}"><div class="tile-placeholder"><span class="placeholder-symbol">${kind==='video'?'▶':kind==='pdf'?'▤':escapeHTML(style.icon)}</span><small>${item.demo?'Design preview':kind==='pdf'?'PDF document':error?(kind==='video'?'Playable on click · no thumbnail':'Preview unavailable · open for retry'):'Waiting for preview…'}</small></div><span class="tile-badge ${badgeClass}">${badge}</span></button><div class="tile-info"><div class="tile-title" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div><p class="tile-description">${escapeHTML(description||'No verified visual description yet')}</p>${why?'<p class="smart-why">Why here: '+escapeHTML(why)+'</p>':''}${when?'<p class="memory-provenance">'+escapeHTML(when)+'</p>':''}<div class="tile-footer"><span class="folder-label" title="${escapeHTML(item.folder)}">${escapeHTML(date)}${note?' · Edited locally':''}</span><button type="button" class="tiny-heart ${favorite?'on':''}" data-favorite="${escapeHTML(item.id)}" aria-label="${favorite?'Remove from':'Add to'} favorites" title="Saved only on this device">${favorite?'♥':'♡'}</button></div></div></article>`;
  }
  function observeThumbs() {
    state.observer?.disconnect();
    if(!state.connected||!state.accessToken)return;
    const all=[...$('galleryGrid').querySelectorAll('[data-open-image]')];
    for(const btn of all){const entry=state.thumbCache.get(btn.dataset.openImage);if(entry)paintThumb(btn.dataset.openImage,entry);}
    if(!('IntersectionObserver' in window)){
      for(const btn of all.slice(0,12)){const item=state.filtered.find(x=>x.id===btn.dataset.openImage);if(item)requestThumb(item);}
      return;
    }
    state.observer = new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const id=entry.target.dataset.openImage;
        state.observer.unobserve(entry.target);
        if(state.thumbErrors.has(id))continue;
        const item=state.filtered.find(x=>x.id===id);
        if(item)requestThumb(item);
      }
    },{rootMargin:'200px'});
    for(const btn of all)state.observer.observe(btn);
  }
  function requestThumb(item,{priority=false,mediaOnly=false,force=false}={}) {
    if(!state.connected || item.demo || !state.accessToken || mediaKind(item)==='pdf')return;
    if(force){state.thumbErrors.delete(item.id);const old=state.thumbCache.get(item.id);if(old?.objectUrl)URL.revokeObjectURL(old.src);state.thumbCache.delete(item.id);}
    if(!mediaOnly&&state.thumbCache.has(item.id)){paintThumb(item.id,state.thumbCache.get(item.id));return;}
    const existing=state.loadingThumbs.get(item.id);
    if(existing){if(priority){const i=state.thumbJobs.indexOf(existing);if(i>=0){state.thumbJobs.splice(i,1);state.thumbJobs.unshift(existing);}}return;}
    if(!force&&state.thumbErrors.has(item.id))return;
    const job={id:item.id,item,token:state.accessToken,mediaOnly,controller:new AbortController()};
    state.loadingThumbs.set(item.id,job);
    if(priority)state.thumbJobs.unshift(job);else state.thumbJobs.push(job);
    pumpThumbJobs();
  }
  function putThumb(id,entry){
    const old=state.thumbCache.get(id);if(old?.objectUrl)URL.revokeObjectURL(old.src);
    state.thumbCache.delete(id);state.thumbCache.set(id,entry);
    while(state.thumbCache.size>96){
      const [first,firstEntry]=state.thumbCache.entries().next().value;
      state.thumbCache.delete(first);if(firstEntry?.objectUrl)URL.revokeObjectURL(firstEntry.src);
    }
    paintThumb(id,entry);updatePreviewStats();
  }
  function pumpThumbJobs() {
    while(state.runningThumbJobs<state.maxConcurrentThumbs && state.thumbJobs.length){
      const job=state.thumbJobs.shift();if(job.token!==state.accessToken){state.loadingThumbs.delete(job.id);continue;}
      state.runningThumbJobs++;state.activeControllers.add(job.controller);
      const timeout=setTimeout(()=>job.controller.abort('timeout'),job.mediaOnly?18000:12000);
      (job.mediaOnly?loadMediaThumb(job.item,job.controller.signal):loadThumb(job.item,job.controller.signal)).then(entry=>{
        if(job.token===state.accessToken&&state.connected) {state.thumbErrors.delete(job.id);putThumb(job.id,entry);}
        else if(entry?.objectUrl) URL.revokeObjectURL(entry.src);
      }).catch(err=>{
        if(job.controller.signal.aborted&&job.controller.signal.reason!=='timeout')return;
        if(!job.mediaOnly){requestFallbackAfterJob(job,err);return;}
        const reason=err?.message||'Image could not be previewed';state.thumbErrors.set(job.id,reason);paintThumb(job.id,null);updatePreviewStats();
      }).finally(()=>{
        clearTimeout(timeout);
        state.runningThumbJobs=Math.max(0,state.runningThumbJobs-1);
        state.activeControllers.delete(job.controller);
        if(state.loadingThumbs.get(job.id)===job)state.loadingThumbs.delete(job.id);
        pumpThumbJobs();
      });
    }
  }
  function requestFallbackAfterJob(job,error){
    // Queue fallback only after this job completes; it must not download all originals at once.
    state.loadingThumbs.delete(job.id);
    if(mediaKind(job.item)!=='image') {
      state.thumbErrors.set(job.id,`Google video thumbnail unavailable (${error?.message||'unknown reason'}). Playback may still work.`);
      paintThumb(job.id,null);return;
    }
    if(job.token===state.accessToken&&(!job.controller.signal.aborted||job.controller.signal.reason==='timeout')) {
      queueMicrotask(()=>requestThumb(job.item,{priority:!!state.activeImage&&state.activeImage.id===job.id,mediaOnly:true}));
    } else if(error)state.thumbErrors.set(job.id,String(error.message||error));
  }
  function safeThumbLink(link) {
    try {const u=new URL(link);const host=u.hostname.toLowerCase();
      return u.protocol==='https:' && (host==='drive.google.com'||host==='googleusercontent.com'||host.endsWith('.googleusercontent.com')||host==='ggpht.com'||host.endsWith('.ggpht.com')) ? u.href : null;
    } catch {return null;}
  }
  async function loadThumb(item,signal) {
    const base=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}`;
    const meta=await googleGet(`${base}?fields=id,mimeType,size,thumbnailLink,capabilities(canDownload)&supportsAllDrives=true`,{signal});
    if(meta.capabilities?.canDownload===false)throw new Error('File owner disabled downloads');
    const src=safeThumbLink(meta.thumbnailLink);
    if(!src)throw new Error('No browser-compatible Google thumbnail link');
    // <img> uses Google's short-lived signed thumbnail URL. Do not send OAuth bearer headers to it.
    return {src,objectUrl:false,kind:'signed'};
  }
  async function loadMediaThumb(item,signal) {
    if(item.size>7*1024*1024)throw new Error('Original exceeds 7 MB thumbnail fallback limit; open in Drive');
    const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`;
    const blob=await googleGet(url,{blob:true,maxBytes:7*1024*1024,signal});
    if(!blob.type.startsWith('image/')&&!item.mime.startsWith('image/'))throw new Error('Not an image');
    if(item.mime==='image/gif')return {src:URL.createObjectURL(blob),objectUrl:true,kind:'media'};
    try {
      const bitmap=await createImageBitmap(blob);
      const scale=Math.min(1,440/bitmap.width,440/bitmap.height);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
      const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.77));
      return {src:URL.createObjectURL(output||blob),objectUrl:true,kind:'media'};
    } catch {return {src:URL.createObjectURL(blob),objectUrl:true,kind:'media'};}
  }
  function handleSignedImageFailure(id) {
    const item=state.images.find(x=>x.id===id), entry=state.thumbCache.get(id);
    if(!item||entry?.kind!=='signed')return;
    state.thumbCache.delete(id);
    const text='Google thumbnail unavailable. Trying a small authenticated preview…';
    for(const btn of document.querySelectorAll('[data-open-image]'))if(btn.dataset.openImage===id){const small=btn.querySelector('.tile-placeholder small');if(small)small.textContent=text;}
    if(mediaKind(item)==='image')requestThumb(item,{priority:state.activeImage?.id===id,mediaOnly:true});
    else {state.thumbErrors.set(id,'Google video thumbnail could not be displayed. Playback may still work.');paintThumb(id,null);}
  }
  function paintThumb(id,entry) {
    for(const btn of document.querySelectorAll('[data-open-image]')) {
      if(btn.dataset.openImage!==id)continue;
      const small=btn.querySelector('.tile-placeholder small');
      if(!entry){if(small)small.textContent=mediaKind(state.images.find(x=>x.id===id)||{})==='video'?'Playable on click · no thumbnail':'Preview unavailable · open for retry';const old=btn.querySelector('img');old?.remove();continue;}
      let img=btn.querySelector('img');
      if(!img){img=document.createElement('img');img.alt='';img.loading='eager';img.decoding='async';btn.appendChild(img);}
      const timer=setTimeout(()=>{if(img.isConnected&&!img.classList.contains('ready')) {if(entry.kind==='signed')handleSignedImageFailure(id);else {state.thumbErrors.set(id,'Preview timed out');paintThumb(id,null);}}},12000);
      img.onload=()=>{clearTimeout(timer);img.classList.add('ready');if(small)small.textContent='';};
      img.onerror=()=>{clearTimeout(timer);img.classList.remove('ready');if(entry.kind==='signed')handleSignedImageFailure(id);else {state.thumbErrors.set(id,'Browser could not display image');paintThumb(id,null);}};
      img.src=entry.src;
      if(small)small.textContent='Loading thumbnail…';
    }
    if(state.activeImage?.id===id)renderModalPicture();
    updatePreviewStats();
  }
  function toggleFavorite(id) {
    if(!safeId(id))return;
    if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);
    try {localStorage.setItem(FAVORITES_STORAGE,JSON.stringify([...state.favorites]));}
    catch {/* Browser storage may be disabled. */}
    if(state.activeImage?.id===id)updateFavoriteButton();
  }
  function openImage(id,origin) {
    const item=state.filtered.find(x=>x.id===id);if(!item)return;
    stopVideo();state.returnFocus=origin||null;state.activeImage=item;
    populateImageDialog();
    if(!$('imageDialog').open)$('imageDialog').showModal();
    if(state.connected)requestThumb(item,{priority:true});
  }
  function populateImageDialog() {
    const item=state.activeImage;if(!item)return;
    $('modalLocation').textContent=item.folder;
    $('modalCollection').textContent=item.collection.toUpperCase();
    $('modalTitle').textContent=item.name;
    $('modalDescription').textContent=effectiveDescription(item)||'This image has no verified description yet.';
    const fields=[['Tags',effectiveTags(item)||'Not indexed'],['Capture date',item.captureDate||'Unknown or unverified'],
       ['Memory Lane date',memorySourceLabel(item)],
      ['Local review',reviewStage(item).replace('-',' ')],
      ['Source review',item.review||'Not reviewed'],['Source confidence',item.confidence||'Not provided']];
    $('modalMeta').innerHTML=fields.map(([key,val])=>`<dt>${escapeHTML(key)}</dt><dd>${escapeHTML(val)}</dd>`).join('');
    const link=$('openDriveLink');link.href=linkToDrive(item)||'#';link.classList.toggle('hidden',!linkToDrive(item));
    $('favoriteImage').disabled=item.demo;updateFavoriteButton();
    populateReviewEditor(item);
    videoUpdateEvidence(item);
    $('storyboardButton').classList.toggle('hidden',item.demo||mediaKind(item)!=='video');
    const playable=mediaKind(item)==='video'||isGIF(item);
    $('playVideoButton').classList.toggle('hidden',!playable||item.demo);
    $('playVideoButton').textContent=isGIF(item)?'▶ Play GIF animation':'▶ Play video';
    renderModalPicture();
  }
  function renderModalPicture() {
    const item=state.activeImage;if(!item)return;
    const entry=state.thumbCache.get(item.id);
    const style=folderStyle(item.folder), error=state.thumbErrors.get(item.id), kind=mediaKind(item);
    $('retryPreview').classList.toggle('hidden',item.demo||!error||kind==='pdf');
    $('generatePosterButton').classList.toggle('hidden',item.demo||kind!=='video');
    $('generatePosterButton').disabled=!!state.posterController||
      !videoLibrary.videoEligibility(item,{operation:'storyboard',canPlay:!!document.createElement('video').canPlayType?.(item.mime||'')}).allowed||!state.connected;
    $('generatePosterButton').title=item.size>MAX_POSTER_VIDEO?'12 MB thumbnail limit':'Create a local preview frame without modifying the original';
    const diagnostic=kind==='video'||isGIF(item)||!!error;
    $('mediaDiagnostics').classList.toggle('hidden',!diagnostic);
    if(diagnostic)renderMediaDiagnostic(item);
    if(state.playingMediaId===item.id && state.videoObjectUrl) return; // Preserve original playback when thumbnails refresh.
    $('previewDetails').textContent=kind==='video' ? `Video · ${humanBytes(item.size)} · click Play video (32 MB limit). Missing thumbnails can be generated separately.` : isGIF(item)? `GIF · ${humanBytes(item.size)} · thumbnail may be still; click Play GIF animation (20 MB limit).` : kind==='pdf' ? 'PDF document · use Open in Drive' : error ? error : (entry ? 'Drive preview' : 'Waiting for Google preview…');
    $('modalPicture').innerHTML=entry?`<img src="${escapeHTML(entry.src)}" alt="${escapeHTML(item.description||item.name)}">`:`<div class="tile-placeholder"><span class="placeholder-symbol">${kind==='video'?'▶':kind==='pdf'?'▤':escapeHTML(style.icon)}</span><small>${kind==='video'?'Use Play video to stream a private preview':kind==='pdf'?'Open in Drive to view the document':item.demo?'Design preview':error?'Preview unavailable; use Retry or Open in Drive':'Preview loading…'}</small></div>`;
    const pic=$('modalPicture').querySelector('img');
    if(pic)pic.onerror=()=>{if(entry.kind==='signed')handleSignedImageFailure(item.id);else{state.thumbErrors.set(item.id,'Image format not supported by browser');paintThumb(item.id,null);}};
  }
  function updateFavoriteButton(){const on=state.favorites.has(state.activeImage?.id);$('favoriteImage').textContent=on?'♥ Favorited':'♡ Favorite';}
  function stopVideo(){
    state.videoController?.abort();state.videoController=null;
    state.posterController?.abort();state.posterController=null;
    videoClearStoryboard();
    $('generatePosterButton').disabled=false;
    const el=$('modalPicture').querySelector('video');if(el)el.pause();
    if(state.videoObjectUrl)URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl=null;
    state.playingMediaId=null;
    // Closing or stepping away while a download is pending must not leave
    // the Play button disabled for the next image.
    $('playVideoButton').disabled=false;
  }
  function renderMediaDiagnostic(item){
    const reason=state.posterError.get(item.id)||state.thumbErrors.get(item.id)||'';
    const entry=state.thumbCache.get(item.id);
    const label=entry?(entry.kind==='generated'?'Locally generated still':entry.kind==='signed'?'Google Drive thumbnail':'Authenticated image'):'Unavailable';
    $('mediaDiagnostics').textContent=`Format: ${item.mime||'Unknown'} · Size: ${humanBytes(item.size)} · Thumbnail: ${label}${reason?' · Note: '+reason:''}`;
    if(mediaKind(item)==='video')videoUpdateEvidence(item);
  }
  async function videoFrameBlob(source,mime,signal){
    // Extract one frame with the browser's decoder. The original file is never modified.
    const mediaUrl=URL.createObjectURL(new Blob([source],{type:mime||'video/mp4'}));
    const video=document.createElement('video');
    video.muted=true;video.playsInline=true;video.preload='auto';
    try{
      await new Promise((resolve,reject)=>{
        let done=false;
        const finish=(error)=>{
          if(done)return;
          done=true;clearTimeout(timer);
          video.removeEventListener('loadeddata',onLoaded);
          video.removeEventListener('error',onError);
          signal?.removeEventListener('abort',onAbort);
          if(error)reject(error);else resolve();
        };
        const onLoaded=()=>video.videoWidth&&video.videoHeight ?
          finish():finish(new Error('Video contains no usable picture'));
        const onError=()=>finish(new Error('This video format cannot produce a thumbnail in your browser'));
        const onAbort=()=>finish(new Error('Thumbnail generation cancelled'));
        const timer=setTimeout(()=>finish(new Error('Frame extraction timed out')),9000);
        video.addEventListener('loadeddata',onLoaded,{once:true});
        video.addEventListener('error',onError,{once:true});
        signal?.addEventListener('abort',onAbort,{once:true});
        video.src=mediaUrl;
        video.load();
      });
      if(signal?.aborted)throw new Error('Thumbnail generation cancelled');
      const scale=Math.min(1,440/video.videoWidth,440/video.videoHeight);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
      canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Canvas rendering unavailable');
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const still=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));
      if(!still)throw new Error('Image encoding failed');
      return still;
    }finally{
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(mediaUrl);
    }
  }
  async function generateVideoThumbnail(){
    const item=state.activeImage;
    if(!item||mediaKind(item)!=='video'||item.demo||state.posterController)return;
    if(item.size>MAX_POSTER_VIDEO){
      $('previewDetails').textContent='This clip exceeds the 12 MB thumbnail limit. You can still play it normally.';
      return;
    }
    const controller=new AbortController();
    state.posterController=controller;state.posterWorkingId=item.id;
    $('generatePosterButton').disabled=true;
    $('previewDetails').textContent='Creating a video thumbnail on this device…';
    try{
      const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`;
      const source=await googleGet(url,{blob:true,maxBytes:MAX_POSTER_VIDEO,signal:controller.signal});
      await videoCheckSignature(source,item);
      if(controller.signal.aborted||state.posterController!==controller||state.activeImage?.id!==item.id)return;
      const jpeg=await videoFrameBlob(source,item.mime,controller.signal);
      if(controller.signal.aborted||state.posterController!==controller||state.activeImage?.id!==item.id)return;
      const src=URL.createObjectURL(jpeg);
      state.thumbErrors.delete(item.id);state.posterError.delete(item.id);
      putThumb(item.id,{src,objectUrl:true,kind:'generated'});
      const previous=videoSession(item);
      state.videoSessionEvidence.set(item.id,{...previous,poster:true});
      videoUpdateEvidence(item);
      $('previewDetails').textContent='Preview frame saved in memory for this session. Original video unchanged.';
    }catch(error){
      if(!controller.signal.aborted&&state.activeImage?.id===item.id){
        const reason=error?.message||'Thumbnail decoding failed';
        state.posterError.set(item.id,reason);
        $('previewDetails').textContent=`Could not generate thumbnail: ${reason}. The video can still play.`;
        renderMediaDiagnostic(item);
      }
    }finally{
      if(state.posterController===controller){
        state.posterController=null;state.posterWorkingId=null;
        $('generatePosterButton').disabled=false;
      }
    }
  }
  async function playVideo(){
    const item=state.activeImage;
    if(!item)return;
    const gif=isGIF(item),clip=mediaKind(item)==='video';
    if(!gif&&!clip)return;
    const maxBytes=gif?MAX_GIF_PREVIEW:MAX_VIDEO_PREVIEW;
    if(item.size>maxBytes){
      $('previewDetails').textContent=`${gif?'GIF':'Video'} exceeds the ${gif?'20':'32'} MB preview limit. Open in Drive instead.`;
      return;
    }
    if(clip){
      // WebM/MP4 support is determined by the embedded browser's actual codecs.
      // A .webm extension alone does not guarantee a usable video codec.
      const probe=document.createElement('video');
      if(typeof probe.canPlayType==='function' && probe.canPlayType(item.mime||'video/webm')===''){
        $('previewDetails').textContent='This browser cannot play the video format. Open in Drive to preview it.';
        return;
      }
    }
    stopVideo();
    const controller=new AbortController();state.videoController=controller;
    const button=$('playVideoButton');button.disabled=true;
    $('previewDetails').textContent=gif?'Loading animated GIF…':'Loading private video preview…';
    try{
      const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`;
      const source=await googleGet(url,{blob:true,maxBytes,signal:controller.signal});
      if(clip)await videoCheckSignature(source,item);
      if(state.videoController!==controller||state.activeImage?.id!==item.id||controller.signal.aborted)return;
      // Drive sometimes returns application/octet-stream. The inventory's verified
      // MIME tells the browser how to decode this private, in-memory file.
      const media=new Blob([source],{type:gif?'image/gif':item.mime});
      if(media.size>maxBytes)throw new Error('Media exceeds preview size limit.');
      const objectUrl=URL.createObjectURL(media);
      state.videoObjectUrl=objectUrl;state.playingMediaId=item.id;
      $('modalPicture').innerHTML='';
      if(gif){
        const img=document.createElement('img');
        img.alt=item.description||item.name;
        img.onerror=()=>{
          if(state.playingMediaId===item.id)$('previewDetails').textContent='Animated GIF could not be decoded. Open in Drive instead.';
        };
        img.src=objectUrl;
        $('modalPicture').appendChild(img);
        $('previewDetails').textContent='Animated GIF loaded locally. Close this viewer to free its memory.';
      }else{
        const video=document.createElement('video');
        video.controls=true;video.playsInline=true;video.autoplay=false;video.preload='metadata';
        video.setAttribute('aria-label',item.name);
        video.onerror=()=>{
          if(state.playingMediaId===item.id)$('previewDetails').textContent='This clip uses a codec the browser cannot decode. Open in Drive instead.';
        };
        video.onended=()=>{
          if(state.playingMediaId!==item.id)return;
          state.videoSessionEvidence.set(item.id,{...videoSession(item),playbackEnded:true});
          videoUpdateEvidence(item);
        };
        video.src=objectUrl;
        $('modalPicture').appendChild(video);
        $('previewDetails').textContent='Video loaded. Use the playback controls; unsupported codecs can be opened in Drive.';
        // A browser may reject autoplay once the authenticated download finishes.
        video.play().catch(()=>{
          if(state.playingMediaId===item.id)$('previewDetails').textContent='Video ready. Press ▶ in the player to start playback.';
        });
      }
    }catch(error){
      if(!controller.signal.aborted && state.activeImage?.id===item.id){
        $('previewDetails').textContent=`Cannot preview ${gif?'GIF':'video'}: ${error.message}. Open in Drive instead.`;
      }
    }finally{
      if(state.videoController===controller)button.disabled=false;
    }
  }
  function stepImage(direction) {
    if(!state.activeImage)return;
    if(state.reviewDirty&&!confirm('Discard unsaved changes to this review?'))return;
    state.reviewDirty=false;
    const at=state.filtered.findIndex(x=>x.id===state.activeImage.id);const next=state.filtered[at+direction];
    if(next){stopVideo();state.activeImage=next;populateImageDialog();if(state.connected)requestThumb(next,{priority:true});}
  }
  function closeImage(){
    if(state.reviewDirty&&!confirm('Discard unsaved review changes?'))return;
    state.reviewDirty=false;stopVideo();
    if($('imageDialog').open)$('imageDialog').close();
    state.activeImage=null;
    if(state.returnFocus?.isConnected)state.returnFocus.focus();
  }
  function installApp() {if(state.installPrompt){const event=state.installPrompt;state.installPrompt=null;event.prompt();event.userChoice?.catch(()=>{});}else $('installDialog').showModal();}
  function showUpdateMessage(message,error=false){const el=$('updateStatusMessage');el.textContent=message;el.classList.toggle('error',error);}
  function updateRepoValue(){return $('updateRepo').value.trim();}
  function validRepo(repo){return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)&&!repo.includes('..');}
  function vettedReleaseURL(repo, value){
    if(!validRepo(repo)||typeof value!=='string')return '';
    try{
      const url=new URL(value);
      if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password)return '';
      const prefix=`/${repo.toLowerCase()}/releases/tag/`;
      return url.pathname.toLowerCase().startsWith(prefix)?url.href:'';
    }catch{return '';}
  }
  function setManualReleaseLink(repo, value){
    const link=$('manualReleaseLink');
    if(!link)return;
    const safe=vettedReleaseURL(repo,value);
    link.hidden=!safe;
    if(safe)link.href=safe;else link.removeAttribute('href');
  }
  async function getUpdateStatus(){
    try {
      const res=await fetch('/__vault_update/status',{cache:'no-store'});
      if(!res.ok)throw new Error('Update engine unavailable');
      const status=await res.json();state.updater=status;
      $('appVersion').textContent=`v${status.version.replace(/^v/,'')} · ${status.source}`;
      $('rollbackButton').disabled=!status.canRollback;
      $('resetButton').disabled=status.source==='built-in';
      showUpdateMessage(status.warning||'Ready. Install a local patch or check your GitHub releases.',!!status.warning);
      return status;
    }catch{
      showUpdateMessage('Update controls work only with the new Windows v2 EXE.',true);
      $('appVersion').textContent='No native updater';return null;
    }
  }
  async function openUpdates(){
    $('updateRepo').value=state.updateRepo;
    $('updatesDialog').showModal();await getUpdateStatus();
  }
  function saveUpdateRepo(){
    const repo=updateRepoValue();
    if(repo&&!validRepo(repo)){showUpdateMessage('Enter a GitHub repository as owner/repo.',true);return false;}
    state.updateRepo=repo;state.remoteRelease=null;$('githubInstallButton').disabled=true;setManualReleaseLink('',null);
    try {if(repo)localStorage.setItem(REPO_STORAGE,repo);else localStorage.removeItem(REPO_STORAGE);localStorage.removeItem(UPDATE_CHECK_STORAGE);}
    catch {showUpdateMessage('Browser storage unavailable; repository saved only until reload.',true);return false;}
    showUpdateMessage(repo?'Repository saved. Updates are checked once per day, and installation is always your choice.':'GitHub repository cleared. Local ZIP patches still work.');return true;
  }
  async function checkGithub({automatic=false}={}){
    const repo=automatic?state.updateRepo:updateRepoValue();
    if(!validRepo(repo)){if(!automatic)showUpdateMessage('Enter a public GitHub repository as owner/repo first.',true);return;}
    const btn=$('updateCheckButton');btn.disabled=true;$('githubInstallButton').disabled=true;setManualReleaseLink('',null);
    try{
      const res=await fetch(`/__vault_update/check?repo=${encodeURIComponent(repo)}`,{cache:'no-store'});
      const data=await res.json();if(!res.ok)throw new Error(data.error||`GitHub returned HTTP ${res.status}`);
      state.remoteRelease=data;
      setManualReleaseLink(repo,data.releaseURL);
      $('releaseStatus').textContent=data.hasPatch ? `Latest release: ${data.releaseVersion}. ${data.available?'An update is ready to install.':'You are up to date.'}` : `Latest release ${data.releaseVersion} does not contain the required ZIP patch.`;
      $('githubInstallButton').disabled=!data.available;
      if(data.available){$('updatesButton').classList.add('update-available');$('updatesButton').title=`Update ${data.releaseVersion} available`;}
      else{$('updatesButton').classList.remove('update-available');}
      showUpdateMessage(data.available?`Update ${data.releaseVersion} found. Choose Install update to apply it.`:'No newer GitHub patch available.');
      try{localStorage.setItem(UPDATE_CHECK_STORAGE,String(Date.now()));}catch{}
    }catch(error){if(!automatic)showUpdateMessage(`GitHub check failed: ${error.message}`,true);}
    finally{btn.disabled=false;}
  }
  async function updateRequest(path,{body,contentType='application/json'}={}){
    if(!state.updater?.nonce)throw new Error('The Windows updater is not available.');
    const res=await fetch(path,{method:'POST',headers:{'X-Vault-Nonce':state.updater.nonce,'Content-Type':contentType},body,cache:'no-store'});
    let data;try{data=await res.json();}catch{throw new Error(`Updater returned HTTP ${res.status}`);}
    if(!res.ok)throw new Error(data.error||`Updater returned HTTP ${res.status}`);
    return data;
  }
  async function reloadAfterPatch(){
    showUpdateMessage('Patch installed. Reloading the new version…');
    try{const reg=await navigator.serviceWorker?.getRegistration();await reg?.update();}catch{}
    location.reload();
  }
  async function installGithub(){
    const repo=updateRepoValue();
    if(!validRepo(repo)||!state.remoteRelease?.available){showUpdateMessage('Check the latest release first.',true);return;}
    if(!confirm(`Install the approved public GitHub release ${state.remoteRelease.releaseVersion}? Your Google Drive files will not be changed.`))return;
    $('githubInstallButton').disabled=true;showUpdateMessage('Downloading, checking SHA-256 hashes and installing…');
    try{await updateRequest('/__vault_update/install-github',{body:JSON.stringify({repo})});await reloadAfterPatch();}
    catch(error){showUpdateMessage(`Update failed: ${error.message}. If GitHub blocks automated downloads, use the release link below to download the ZIP, then choose Verify & install ZIP.`,true);$('githubInstallButton').disabled=false;}
  }
  async function installLocalPatch(){
    const file=$('localPatchFile').files?.[0];
    if(!file){showUpdateMessage('Select a patch .zip file first.',true);return;}
    if(file.size>14*1024*1024){showUpdateMessage('Patch ZIP exceeds 14 MB safety limit.',true);return;}
    if(!confirm(`Verify and install ${file.name}? Only app interface files can be updated. No Drive images will be touched.`))return;
    const btn=$('localInstallButton');btn.disabled=true;showUpdateMessage('Checking patch file names, version and SHA-256 hashes…');
    try{await updateRequest('/__vault_update/install-local',{body:file,contentType:'application/zip'});await reloadAfterPatch();}
    catch(error){showUpdateMessage(`Local patch rejected: ${error.message}`,true);btn.disabled=false;}
  }
  async function recoveryAction(kind){
    const label=kind==='rollback'?'restore the previous version':'restore the built-in v2.0.0 UI';
    if(!confirm(`Do you want to ${label}? Your OAuth settings and images are not changed.`))return;
    try{await updateRequest(`/__vault_update/${kind}`,{body:'{}'});await reloadAfterPatch();}
    catch(error){showUpdateMessage(`Recovery failed: ${error.message}`,true);}
  }
  function autoCheckOnStartup(){
    if(!state.updateRepo)return;
    let last=0;try{last=Number(localStorage.getItem(UPDATE_CHECK_STORAGE)||0);}catch{}
    if(Date.now()-last<24*60*60*1000)return;
    // Passive check only; never install or run release code without user confirmation.
    setTimeout(()=>getUpdateStatus().then(ok=>{if(ok)checkGithub({automatic:true});}),2200);
  }
  function initEvents() {
    document.querySelectorAll('[data-view]').forEach(btn=>btn.onclick=()=>displayPage(btn.dataset.view));
    $('settingsButton').onclick=showPreferences;
    $('sidebarPreferences').onclick=showPreferences;
    $('sidebarSettings').onclick=showSettings;
    $('preferencesClose').onclick=()=>$('preferencesDialog').close();
    $('preferencesCancel').onclick=()=>$('preferencesDialog').close();
    $('preferencesForm').onsubmit=savePreferences;
    $('clearBrowseHistory').onclick=()=>{
      clearBrowsingPosition();
      $('clearBrowseHistory').textContent='Saved position cleared ✓';
      setTimeout(()=>$('clearBrowseHistory').textContent='Forget saved browsing position',1800);
    };
    $('preferencesConnection').onclick=()=>{
      $('preferencesDialog').close();
      showSettings();
    };
    $('updatesButton').onclick=openUpdates;$('sidebarUpdates').onclick=openUpdates;
    $('updatesClose').onclick=()=>$('updatesDialog').close();
    $('saveRepoButton').onclick=saveUpdateRepo;$('updateCheckButton').onclick=()=>checkGithub();
    $('githubInstallButton').onclick=installGithub;$('localInstallButton').onclick=installLocalPatch;
    $('rollbackButton').onclick=()=>recoveryAction('rollback');$('resetButton').onclick=()=>recoveryAction('reset');
    $('settingsClose').onclick=()=>$('settingsDialog').close();$('cancelSettings').onclick=()=>$('settingsDialog').close();
    $('clientIdInput').oninput=()=>$('clientIdInput').setCustomValidity('');
    $('sheetIdInput').oninput=()=>$('sheetIdInput').setCustomValidity('');
    $('settingsForm').onsubmit=saveSettings;
    $('connectButton').onclick=connect;$('heroConnectButton').onclick=connect;$('disconnectButton').onclick=disconnect;
    $('installButton').onclick=installApp;$('installClose').onclick=()=>$('installDialog').close();$('installOkay').onclick=()=>$('installDialog').close();
    $('exploreButton').onclick=()=>displayPage('all');$('seeAllButton').onclick=()=>displayPage('all');
    $('backSmartCollections').onclick=()=>displayPage('smart');
    $('backMemoryLane').onclick=()=>displayPage('memory',{reset:false});
    $('memoryYearSelect').onchange=e=>{state.memoryYear=e.target.value;renderMemoryLane();scheduleBrowseSave();};
    $('memorySourceSelect').onchange=e=>{state.memorySource=e.target.value;renderMemoryLane();scheduleBrowseSave();};
    $('memoryTodayButton').onclick=()=>memoryOpenGroup('today');
    $('memoryUnknownButton').onclick=()=>memoryOpenGroup('unknown');
    $('videoCatalogFilter').onchange=event=>{
      if(!['all','unverified','reviewed','oversized'].includes(event.target.value))return;
      state.videoLibraryFilter=event.target.value;state.videoLibraryPage=1;videoRenderCatalog();
    };
    $('videoCatalogPrev').onclick=()=>{state.videoLibraryPage=Math.max(1,state.videoLibraryPage-1);videoRenderCatalog();};
    $('videoCatalogNext').onclick=()=>{state.videoLibraryPage++;videoRenderCatalog();};
    $('storyboardButton').onclick=videoGenerateStoryboard;
    $('storyboardCancel').onclick=videoClearStoryboard;
    $('smartAddButton').onclick=()=>openSmartEditor();
    $('smartAddRuleButton').onclick=()=>{
      if(!state.smartDraft||state.smartDraft.rules.length>=smartEngine.SMART_RULE_LIMIT)return;
      state.smartDraft.rules.push({field:'text',value:''});renderSmartRuleRows();
    };
    $('smartEditorForm').onsubmit=saveSmartEditor;
    $('smartEditorCancel').onclick=()=>{$('smartEditorDialog').close();state.smartDraft=null;};
    $('smartImportButton').onclick=()=>$('smartImportFile').click();
    $('smartImportFile').onchange=async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{await importSmartCollections(file);}
      catch(error){alertUser('Smart Collection import failed: '+error.message,'error');}
      finally{event.target.value='';}
    };
    $('smartExportButton').onclick=exportSmartCollections;
    $('searchInput').oninput=event=>{
      const input=event.target.value.slice(0,searchEngine.SEARCH_MAX_QUERY);
      if(input.trim()&&!state.search.trim()&&state.sort==='name')state.sort='relevance';
      if(!input.trim()&&state.sort==='relevance')state.sort='name';
      state.search=input;state.activeSavedSearch='';state.page=1;renderGallery();
    };
    $('saveSearchButton').onclick=openSaveSearchDialog;
    $('savedSearchSelect').onchange=event=>applySavedSearch(event.target.value);
    $('deleteSavedSearchButton').onclick=deleteSavedSearch;
    $('saveSearchForm').onsubmit=saveNamedSearch;
    $('saveSearchCancel').onclick=()=>$('saveSearchDialog').close();
    $('mediaTypeSelect').onchange=event=>{state.mediaType=event.target.value;state.activeSavedSearch='';state.page=1;renderGallery();};
    $('folderSearch').oninput=event=>{state.folderQuery=event.target.value;renderGallery();};
    $('folderSelect').onchange=event=>{state.folder=event.target.value;state.activeSavedSearch='';state.page=1;renderGallery();};
    $('reviewQueueFilter').onchange=event=>{
      if(!['pending','deferred','reviewed','all'].includes(event.target.value))return;
      state.reviewFilter=event.target.value;state.page=1;renderGallery();
    };
    $('reviewDescription').oninput=()=>{state.reviewDirty=true;};
    $('reviewTags').oninput=()=>{state.reviewDirty=true;};
    $('reviewForm').onsubmit=event=>{event.preventDefault();saveCurrentReview('reviewed',{advance:true});};
    $('reviewSaveDraft').onclick=()=>saveCurrentReview('draft');
    $('reviewDefer').onclick=()=>saveCurrentReview('deferred',{advance:true});
    $('reviewReset').onclick=resetCurrentReview;
    $('reviewExport').onclick=exportReviewBackup;
    $('reviewBatchImport').onclick=()=>$('reviewBatchImportFile').click();
    $('reviewBatchImportFile').onchange=async event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      try{await importChatGPTReviewBatch(file);}
      catch(error){alertUser('Review batch import failed: '+error.message,'error');}
      finally{event.target.value='';}
    };
    $('reviewImport').onclick=()=>$('reviewImportFile').click();
    $('reviewImportFile').onchange=async event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      try{await importReviewBackup(file);}
      catch(error){alertUser('Review import failed: '+error.message,'error');}
      finally{event.target.value='';}
    };
    $('densitySelect').onchange=event=>{
      if(!['comfortable','compact','large'].includes(event.target.value))return;
      state.density=event.target.value;
      try{localStorage.setItem(DENSITY_STORAGE,state.density);}catch{}
      renderGallery();
    };
    $('syncButton').onclick=()=>refreshSheetAndDrive();
    $('healthScanButton').onclick=()=>syncWithDrive({full:true});
    $('clearSyncCacheButton').onclick=()=>{
      clearLocalSyncCache();
      updateScanSummary('Local scan cache cleared. The next sign-in will perform a full read-only scan.');
    };
    $('sortSelect').onchange=event=>{state.sort=event.target.value;state.activeSavedSearch='';renderGallery();};
    $('layoutButton').onclick=()=>{state.layout=state.layout==='grid'?'list':'grid';renderGallery();};
    $('closeImage').onclick=closeImage;$('prevImage').onclick=()=>stepImage(-1);$('nextImage').onclick=()=>stepImage(1);
    $('playVideoButton').onclick=playVideo;
    $('generatePosterButton').onclick=generateVideoThumbnail;
    $('favoriteImage').onclick=()=>{if(!state.activeImage?.demo){toggleFavorite(state.activeImage.id);renderGallery();}};
    $('retryPreview').onclick=()=>{if(state.activeImage){requestThumb(state.activeImage,{priority:true,force:true});renderModalPicture();}};
    $('retryFailedButton').onclick=()=>{for(const item of state.filtered.slice(0,state.page*state.pageSize)){if(state.thumbErrors.has(item.id))requestThumb(item,{force:true});}updatePreviewStats();};
    $('imageDialog').addEventListener('cancel',event=>{
      if(state.reviewDirty&&!confirm('Discard unsaved review changes?'))event.preventDefault();
      else state.reviewDirty=false;
    });
    $('imageDialog').addEventListener('close',()=>{state.reviewDirty=false;stopVideo();state.activeImage=null;if(state.returnFocus?.isConnected)state.returnFocus.focus();});
    $('backToTop').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
    window.addEventListener('scroll',()=>{
      updateScrollControls();
      scheduleBrowseSave();
    },{passive:true});
    window.addEventListener('pagehide',saveBrowsingPosition);
    window.addEventListener('keydown',event=>{
      if($('imageDialog').open){
        const tag=event.target?.tagName||'';
        if(/^(INPUT|TEXTAREA|SELECT)$/.test(tag)||event.target?.isContentEditable)return;
        if(event.key==='ArrowLeft'){event.preventDefault();stepImage(-1);}
        if(event.key==='ArrowRight'){event.preventDefault();stepImage(1);}
        return;
      }
      if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){
        event.preventDefault();if(state.view==='home')displayPage('all');$('searchInput').focus();
      }
    });
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;});
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&state.connected&&!state.scanning&&state.lastScanAt&&Date.now()-new Date(state.lastScanAt).getTime()>SCAN_INTERVAL&&Date.now()<state.expiry)syncWithDrive({quiet:true});
    });
    window.addEventListener('appinstalled',()=>{state.installPrompt=null;alertUser('Image Vault installed. You can launch it from your Windows Start menu or taskbar.', 'success');});
  }
  function init() {
    buildFolderIndex();initEvents();updateStatus();render();$('originText').textContent=location.origin;
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
    }
    if(location.protocol==='file:')alertUser('This is a design preview. Launch the Windows EXE to connect Google Drive.');
    autoCheckOnStartup();
  }
  init();
})();