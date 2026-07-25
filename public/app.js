const $ = id => document.getElementById(id);
const arrayFields = ["rooms","colors","moods","styles","subjects","gift_recipients","shopify_tags","highlights"];
const scalarFields = ["product_title","primary_collection","seo_title","url_handle","meta_description","image_alt_text","short_description","long_description","artwork_type","season","holiday"];
let selectedFormat="", selectedSellAs="Canvas & Print", imageDataUrl="", originalFilename="", currentProduct=null, products=[];

function log(message){const line=document.createElement("div");line.className="log-line";line.innerHTML=`<time>${new Date().toLocaleTimeString()}</time>${escapeHtml(message)}`;$("activityLog").prepend(line)}
function escapeHtml(s){return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function choose(groupId, value){document.querySelectorAll(`#${groupId} button`).forEach(b=>b.classList.toggle("selected",b.dataset.value===value));if(groupId==="formatChoices")selectedFormat=value;else selectedSellAs=value}
function inferFormat(file){return new Promise(resolve=>{const img=new Image();img.onload=()=>{const r=img.width/img.height;resolve(r>2?"Panorama":r>1.08?"Landscape":r<.92?"Portrait":"Square")};img.src=URL.createObjectURL(file)})}
async function useFile(file){
  if(!file||!file.type.startsWith("image/"))return;
  try{
    if(!currentProduct)await newProduct();
    originalFilename=file.name;
    imageDataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    $("preview").src=imageDataUrl;
    $("dropzone").classList.add("has-image");
    if(!$("artworkName").value)$("artworkName").value=file.name.replace(/\.[^.]+$/,"" ).replace(/[_-]+/g," ");
    choose("formatChoices",await inferFormat(file));
    log(`Artwork loaded: ${file.name}`);
    await generate();
  }catch(e){$("error").textContent=e.message;log(`ERROR: ${e.message}`)}
}
function setBusy(busy){$("generateBtn").disabled=busy;$("generateBtn").textContent=busy?"Generating…":"Regenerate Product"}
async function showNextId(){try{const r=await fetch("/api/next-id");const j=await r.json();$("currentNgId").textContent=`Next: ${j.ngId}`;return j.ngId}catch{$("currentNgId").textContent="Automatic NG ID";return null}}
async function health(){try{const r=await fetch("/api/health");const h=await r.json();$("status").textContent=h.configured?`Ready • ${h.model}`:"API key missing";$("status").classList.toggle("ready",h.configured);log(`Studio v${h.version} started using ${h.model}`)}catch{$("status").textContent="Server unavailable"}}
async function refreshLibrary(search=""){const r=await fetch(`/api/products?search=${encodeURIComponent(search)}`);const j=await r.json();products=j.products||[];$("libraryCount").textContent=`${products.length} product${products.length===1?"":"s"}`;renderLibrary()}
function renderLibrary(){const list=$("productList");list.innerHTML="";if(!products.length){list.innerHTML='<div class="empty" style="height:auto;padding:20px">No saved products yet.</div>';return}for(const p of products){const el=document.createElement("div");el.className="product-item"+(currentProduct?.ng_id===p.ng_id?" selected":"");el.innerHTML=`<strong>${escapeHtml(p.ng_id)}</strong><span>${escapeHtml(p.product_title||"Untitled product")}</span><small>${escapeHtml(p.primary_collection||"No collection")} • ${escapeHtml(p.status)}</small>`;el.onclick=()=>showProduct(p);list.appendChild(el)}}
function fillProduct(p){for(const f of scalarFields)$(f).value=p[f]||"";for(const f of arrayFields)$(f).value=(p[f]||[]).join(", ");$("confidence").textContent=`${Number(p.confidence||0)}%`;$("productStatus").textContent=p.status||"Draft";$("recordStatus").textContent=`${p.ng_id} • saved ${new Date(p.updated_at||p.created_at).toLocaleString()}`;$("results").hidden=false;$("emptyState").hidden=true;for(const id of ["saveBtn","csvBtn","jsonBtn"])$(id).disabled=false}
function showProduct(p){currentProduct=p;fillProduct(p);if(p.artwork_url){$("preview").src=p.artwork_url;$("dropzone").classList.add("has-image")}$("currentNgId").textContent=p.ng_id;$("artworkName").value=p.original_filename?.replace(/\.[^.]+$/,"")||p.product_title||"";if(p.format)choose("formatChoices",p.format);if(p.sell_as)choose("sellChoices",p.sell_as);lastSavedPayload=JSON.stringify(collectEdited());renderLibrary();log(`Opened ${p.ng_id}`)}
function collectEdited(){const data={};for(const f of scalarFields)data[f]=$(f).value.trim();for(const f of arrayFields)data[f]=$(f).value.split(",").map(x=>x.trim()).filter(Boolean);data.confidence=currentProduct?.confidence||0;data.status=currentProduct?.status||"Draft";data.format=selectedFormat;data.sell_as=selectedSellAs;data.source_type=$("sourceType").value.trim();data.rights_status=$("rightsStatus").value.trim();return data}
async function generate(){try{$("error").textContent="";if(!imageDataUrl)throw new Error("Choose an artwork image first.");if(!$("artworkName").value.trim())throw new Error("Enter a working artwork name.");if(!selectedFormat)throw new Error("Choose a format.");setBusy(true);log("Sending artwork to AI for analysis…");const r=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ngId:currentProduct?.ng_id,artworkName:$("artworkName").value.trim(),format:selectedFormat,sellAs:selectedSellAs,sourceType:$("sourceType").value.trim(),rightsStatus:$("rightsStatus").value.trim(),imageDataUrl,originalFilename})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Generation failed.");currentProduct=j.data;fillProduct(currentProduct);lastSavedPayload=JSON.stringify(collectEdited());$("currentNgId").textContent=currentProduct.ng_id;log(`${currentProduct.ng_id} generated and saved.`);await refreshLibrary()}catch(e){$("error").textContent=e.message;log(`ERROR: ${e.message}`)}finally{setBusy(false)}}
let autoSaveTimer=null,saveInProgress=false,saveQueued=false,lastSavedPayload="";
function setSaveStatus(message){
  if(!currentProduct)return;

  const status=$("recordStatus");
  status.textContent=`${currentProduct.ng_id} • ${message}`;

  status.classList.remove(
    "save-saved",
    "save-saving",
    "save-unsaved",
    "save-failed"
  );

  const text=message.toLowerCase();

  if(text.includes("failed")){
    status.classList.add("save-failed");
  }else if(text.includes("saving")){
    status.classList.add("save-saving");
  }else if(text.includes("unsaved")){
    status.classList.add("save-unsaved");
  }else if(text.includes("saved")){
    status.classList.add("save-saved");
  }
}

function scheduleAutoSave(){
  if(!currentProduct)return;
  clearTimeout(autoSaveTimer);
  setSaveStatus("unsaved changes");
  autoSaveTimer=setTimeout(()=>saveChanges(true),1000);
}

async function saveChanges(isAutoSave=false){
}function scheduleAutoSave(){
  if(!currentProduct)return;
  clearTimeout(autoSaveTimer);
  setSaveStatus("unsaved changes");
  autoSaveTimer=setTimeout(()=>saveChanges(true),1000);
}
async function saveChanges(isAutoSave=false){
  if(!currentProduct)return;
  const payload=JSON.stringify(collectEdited());
  if(isAutoSave&&payload===lastSavedPayload){setSaveStatus("saved");return}
  if(saveInProgress){saveQueued=true;return}
  saveInProgress=true;
  setSaveStatus("saving…");
  try{
    const r=await fetch(`/api/products/${encodeURIComponent(currentProduct.ng_id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:payload});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||"Save failed.");
    currentProduct=j.product;
    lastSavedPayload=JSON.stringify(collectEdited());
    setSaveStatus(`saved ${new Date(currentProduct.updated_at||Date.now()).toLocaleTimeString()}`);
    await refreshLibrary($("searchInput").value);
    if(!isAutoSave)log(`${currentProduct.ng_id} changes saved.`);
  }catch(e){setSaveStatus("save failed");log(`ERROR: ${e.message}`)}
  finally{
    saveInProgress=false;
    if(saveQueued){saveQueued=false;scheduleAutoSave()}
  }
}
function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportJson(){if(!currentProduct)return;download(`${currentProduct.ng_id}.json`,JSON.stringify({...currentProduct,...collectEdited()},null,2),"application/json")}
function csvCell(v){const s=Array.isArray(v)?v.join(", "):String(v??"");return `"${s.replace(/"/g,'""')}"`}
function exportCsv(){if(!currentProduct)return;const p={...currentProduct,...collectEdited()};const headers=["Handle","Title","Body (HTML)","Vendor","Product Category","Type","Tags","Published","SEO Title","SEO Description","Image Src","Image Alt Text","Status","NG ID"];const row=[p.url_handle,p.product_title,p.long_description,"Neon Gopher",p.primary_collection,p.artwork_type,p.shopify_tags,false,p.seo_title,p.meta_description,"",p.image_alt_text,"draft",p.ng_id];download(`${p.ng_id}-shopify.csv`,headers.map(csvCell).join(",")+"\n"+row.map(csvCell).join(","),"text/csv")}
async function newProduct(){
  try{
    $("error").textContent="";
    const r=await fetch("/api/products",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||"Could not create product.");
    currentProduct=j.product;
    imageDataUrl="";originalFilename="";
    $("preview").removeAttribute("src");
    $("dropzone").classList.remove("has-image");
    $("imageInput").value="";
    $("artworkName").value="";
    selectedFormat="";
    document.querySelectorAll("#formatChoices button").forEach(b=>b.classList.remove("selected"));
    fillProduct(currentProduct);
    lastSavedPayload=JSON.stringify(collectEdited());
    $("currentNgId").textContent=currentProduct.ng_id;
    $("recordStatus").textContent=`${currentProduct.ng_id} • new draft`;
    await refreshLibrary($("searchInput").value);
    log(`${currentProduct.ng_id} created and saved as a draft.`);
    return currentProduct;
  }catch(e){$("error").textContent=e.message;log(`ERROR: ${e.message}`);throw e}
}

$("formatChoices").onclick=e=>{if(e.target.dataset.value){choose("formatChoices",e.target.dataset.value);scheduleAutoSave()}};
$("sellChoices").onclick=e=>{if(e.target.dataset.value){choose("sellChoices",e.target.dataset.value);scheduleAutoSave()}};
$("imageInput").onchange=e=>useFile(e.target.files[0]);
$("dropzone").ondragover=e=>{e.preventDefault();$("dropzone").classList.add("drag")};
$("dropzone").ondragleave=()=>$("dropzone").classList.remove("drag");
$("dropzone").ondrop=e=>{e.preventDefault();$("dropzone").classList.remove("drag");useFile(e.dataTransfer.files[0])};
$("generateBtn").onclick=generate;$("saveBtn").onclick=saveChanges;$("jsonBtn").onclick=exportJson;$("csvBtn").onclick=exportCsv;$("newBtn").onclick=newProduct;
$("searchInput").oninput=e=>refreshLibrary(e.target.value);
document.querySelectorAll("#results input, #results textarea, #results select").forEach(el=>{
  el.addEventListener("input",scheduleAutoSave);
  el.addEventListener("change",scheduleAutoSave);
});
$("sourceType").addEventListener("change",scheduleAutoSave);
$("rightsStatus").addEventListener("change",scheduleAutoSave);
$("clearLogBtn").onclick=()=>$("activityLog").innerHTML="";
$("backupBtn").onclick=async()=>{try{const r=await fetch("/api/backup",{method:"POST"});const j=await r.json();if(!r.ok)throw new Error(j.error);log(`Database backup created: ${j.filename}`)}catch(e){log(`ERROR: ${e.message}`)}};
health();refreshLibrary();showNextId();


// v1.8.0 Scene Builder + named placement objects
const navButtons=[...document.querySelectorAll(".nav-btn")];
navButtons.forEach(btn=>btn.addEventListener("click",()=>{
  navButtons.forEach(b=>b.classList.toggle("selected",b===btn));
  document.querySelectorAll(".app-view").forEach(v=>v.hidden=v.id!==btn.dataset.view);
  const productMode=btn.dataset.view==="productsView";
  $("newBtn").style.display=productMode?"":"none";
  if(btn.dataset.view==="sceneView") refreshScenes();
  if(btn.dataset.view==="profilesView") loadProductProfiles();
}));
let sceneImageDataUrl="",sceneImageWidth=0,sceneImageHeight=0,sceneArea=null;
let placements=[],activePlacementId="";
let mockupArtworkDataUrl="",mockupArtworkName="",generatedMockupDataUrl="";
let sceneInteraction=null,sceneStart=null,sceneStartArea=null;
const MIN_SCENE_AREA=.015;
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function placementId(){return `P-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`}
function activePlacement(){return placements.find(p=>p.id===activePlacementId)||null}
function syncActivePlacement(){const p=activePlacement();if(p)p.area=sceneArea?{...sceneArea}:null}
function addPlacement(seed={}){
  syncActivePlacement();
  const requested=seed.type||"Landscape";if(placements.some(x=>x.type===requested)){const available=["Landscape","Portrait","Square","Panorama"].find(x=>!placements.some(p=>p.type===x));if(!available){$("sceneError").textContent="This scene already has all four orientation slots.";return}seed.type=available}
  const type=seed.type||"Landscape", ratioDefault={Landscape:"3:2",Portrait:"2:3",Square:"1:1",Panorama:"3:1"}[type]||"free";
  const p={id:seed.id||placementId(),name:seed.name||`${type} Display`,type,orientation:type,displaySize:seed.displaySize||"Largest practical display for this wall",ratio:seed.ratio||ratioDefault,area:seed.area?{...seed.area}:null};
  placements.push(p);activePlacementId=p.id;sceneArea=p.area?{...p.area}:null;
  renderPlacementList();loadPlacementFields();renderSceneArea();
}
function selectPlacement(id){syncActivePlacement();activePlacementId=id;const p=activePlacement();sceneArea=p?.area?{...p.area}:null;renderPlacementList();loadPlacementFields();renderSceneArea();updatePlacedArtwork()}
function deleteActivePlacement(){const p=activePlacement();if(!p)return;placements=placements.filter(x=>x.id!==p.id);activePlacementId=placements[0]?.id||"";sceneArea=activePlacement()?.area?{...activePlacement().area}:null;renderPlacementList();loadPlacementFields();renderSceneArea()}
function renderPlacementList(){
  const list=$("placementList");$("placementCount").textContent=`${placements.length} placement${placements.length===1?"":"s"}`;
  list.innerHTML=placements.length?"":'<div class="empty" style="height:auto;padding:12px">No placements yet.</div>';
  placements.forEach((p,i)=>{const el=document.createElement("div");el.className=`placement-item${p.id===activePlacementId?" selected":""}`;el.innerHTML=`<div><strong>${escapeHtml(p.name||`Placement ${i+1}`)}</strong><small>${escapeHtml(p.type)} • ${escapeHtml(p.ratio==="free"?"Custom ratio":p.ratio)} • largest display</small></div><span class="placement-badge">${p.area?"DRAWN":"EMPTY"}</span>`;el.onclick=()=>selectPlacement(p.id);list.appendChild(el)});
}
function loadPlacementFields(){const p=activePlacement();["placementName","placementType","placementRatio","placementDisplaySize"].forEach(id=>$(id).disabled=!p);$("deletePlacementBtn").disabled=!p;if(!p){$("placementName").value="";return}$("placementName").value=p.name;$("placementType").value=p.type;$("placementRatio").value=p.ratio;$("placementDisplaySize").value=p.displaySize||"Largest practical display for this wall"}
function updatePlacementFields(){const p=activePlacement();if(!p)return;const nextType=$("placementType").value;if(nextType!==p.type&&placements.some(x=>x.id!==p.id&&x.type===nextType)){$("sceneError").textContent=`Only one ${nextType} slot is allowed per scene.`;$("placementType").value=p.type;return}$("sceneError").textContent="";p.name=$("placementName").value.trim()||`${nextType} Display`;p.type=nextType;p.orientation=nextType;p.displaySize=$("placementDisplaySize").value.trim()||"Largest practical display for this wall";p.ratio=$("placementRatio").value;renderPlacementList()}
function clearSceneBuilder(){
  sceneImageDataUrl="";sceneImageWidth=0;sceneImageHeight=0;sceneArea=null;sceneInteraction=null;placements=[];activePlacementId="";
  $("sceneImageInput").value="";$("sceneBackground").removeAttribute("src");$("sceneStage").classList.remove("has-image");
  $("artworkArea").hidden=true;$("artworkArea").classList.remove("has-artwork");$("placedArtwork").removeAttribute("src");$("areaReadout").textContent="No placement selected";$("sceneError").textContent="";$("sceneStatus").textContent="";
  addPlacement({name:"Landscape Display",type:"Landscape",ratio:"3:2"});
}
function stageImageBox(){const stage=$("sceneStage"),img=$("sceneBackground");const sr=stage.getBoundingClientRect(),ir=img.getBoundingClientRect();return {left:ir.left-sr.left,top:ir.top-sr.top,width:ir.width,height:ir.height}}
function normalizedPointer(e){const b=stageImageBox(),r=$("sceneStage").getBoundingClientRect();return {x:clamp((e.clientX-r.left-b.left)/b.width,0,1),y:clamp((e.clientY-r.top-b.top)/b.height,0,1),box:b}}
function applyRatio(area,ratio,corner){
  if(!area||ratio==="free")return area;const [rw,rh]=ratio.split(":").map(Number),target=rw/rh;if(!target||!Number.isFinite(target))return area;
  let {x,y,width,height}=area;if(width/height>target)width=height*target;else height=width/target;
  if(corner?.includes("w"))x=area.x+area.width-width;if(corner?.includes("n"))y=area.y+area.height-height;
  x=clamp(x,0,1-width);y=clamp(y,0,1-height);return {x,y,width,height};
}
function renderSceneArea(){
  const el=$("artworkArea"),p=activePlacement();
  if(!p||!sceneArea){el.hidden=true;$("areaReadout").textContent=p?`${p.name}: draw area on image`:"No placement selected";renderPlacementList();return}
  const b=stageImageBox();el.style.left=`${b.left+sceneArea.x*b.width}px`;el.style.top=`${b.top+sceneArea.y*b.height}px`;el.style.width=`${sceneArea.width*b.width}px`;el.style.height=`${sceneArea.height*b.height}px`;el.hidden=false;
  $("areaReadout").textContent=`${p.name} • ${Math.round(sceneArea.width*100)}% × ${Math.round(sceneArea.height*100)}%`;syncActivePlacement();renderPlacementList();
}
$("sceneImageInput").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{sceneImageDataUrl=reader.result;const img=$("sceneBackground");img.onload=()=>{sceneImageWidth=img.naturalWidth;sceneImageHeight=img.naturalHeight;$("sceneStage").classList.add("has-image");placements.forEach(p=>p.area=null);sceneArea=null;renderSceneArea();log(`Scene background loaded: ${file.name}`)};img.src=sceneImageDataUrl};reader.readAsDataURL(file)});
$("sceneBackground").addEventListener("dragstart",e=>e.preventDefault());
$("sceneStage").addEventListener("pointerdown",e=>{
  if(!sceneImageDataUrl)return;if(!activePlacement())addPlacement();e.preventDefault();const point=normalizedPointer(e),handle=e.target.closest?.(".resize-handle");sceneStart={x:point.x,y:point.y};sceneStartArea=sceneArea?{...sceneArea}:null;
  const insideArea=!!(sceneArea&&point.x>=sceneArea.x&&point.x<=sceneArea.x+sceneArea.width&&point.y>=sceneArea.y&&point.y<=sceneArea.y+sceneArea.height);
  if(handle&&sceneArea)sceneInteraction={type:"resize",corner:handle.dataset.corner};else if(insideArea)sceneInteraction={type:"move"};else{sceneInteraction={type:"draw"};sceneArea={x:point.x,y:point.y,width:0,height:0}}
  $("sceneStage").setPointerCapture(e.pointerId);renderSceneArea();
});
$("sceneStage").addEventListener("pointermove",e=>{
  if(!sceneInteraction)return;const p=normalizedPointer(e),placement=activePlacement();
  if(sceneInteraction.type==="draw")sceneArea={x:Math.min(sceneStart.x,p.x),y:Math.min(sceneStart.y,p.y),width:Math.abs(p.x-sceneStart.x),height:Math.abs(p.y-sceneStart.y)};
  else if(sceneInteraction.type==="move"){const dx=p.x-sceneStart.x,dy=p.y-sceneStart.y;sceneArea={...sceneStartArea,x:clamp(sceneStartArea.x+dx,0,1-sceneStartArea.width),y:clamp(sceneStartArea.y+dy,0,1-sceneStartArea.height)}}
  else if(sceneInteraction.type==="resize"){let left=sceneStartArea.x,top=sceneStartArea.y,right=left+sceneStartArea.width,bottom=top+sceneStartArea.height;const c=sceneInteraction.corner;if(c.includes("w"))left=clamp(p.x,0,right-MIN_SCENE_AREA);else right=clamp(p.x,left+MIN_SCENE_AREA,1);if(c.includes("n"))top=clamp(p.y,0,bottom-MIN_SCENE_AREA);else bottom=clamp(p.y,top+MIN_SCENE_AREA,1);sceneArea={x:left,y:top,width:right-left,height:bottom-top}}
  if(placement?.ratio!=="free"&&sceneArea.width>=MIN_SCENE_AREA&&sceneArea.height>=MIN_SCENE_AREA)sceneArea=applyRatio(sceneArea,placement.ratio,sceneInteraction.corner);renderSceneArea();
});
function finishSceneInteraction(e){if(!sceneInteraction)return;if(sceneInteraction.type==="draw"&&(sceneArea.width<MIN_SCENE_AREA||sceneArea.height<MIN_SCENE_AREA))sceneArea=sceneStartArea;sceneInteraction=null;if(e&&$("sceneStage").hasPointerCapture?.(e.pointerId))$("sceneStage").releasePointerCapture(e.pointerId);syncActivePlacement();renderSceneArea()}
$("sceneStage").addEventListener("pointerup",finishSceneInteraction);$("sceneStage").addEventListener("pointercancel",finishSceneInteraction);$("sceneStage").addEventListener("lostpointercapture",()=>{sceneInteraction=null;syncActivePlacement();renderSceneArea()});
window.addEventListener("keydown",e=>{const sceneVisible=!$("sceneView").hidden;if(!sceneVisible||!sceneArea||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;const step=e.shiftKey?.01:.0025;let dx=0,dy=0;if(e.key==="ArrowLeft")dx=-step;else if(e.key==="ArrowRight")dx=step;else if(e.key==="ArrowUp")dy=-step;else if(e.key==="ArrowDown")dy=step;else return;e.preventDefault();sceneArea={...sceneArea,x:clamp(sceneArea.x+dx,0,1-sceneArea.width),y:clamp(sceneArea.y+dy,0,1-sceneArea.height)};renderSceneArea()});
window.addEventListener("resize",renderSceneArea);
function makeSceneThumbnail(){return new Promise(resolve=>{const img=new Image();img.onload=()=>{const max=600,scale=Math.min(1,max/img.width),c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL("image/png"))};img.src=sceneImageDataUrl})}
function updatePlacedArtwork(){const area=$("artworkArea"),img=$("placedArtwork"),fit=$("mockupFit").value;area.classList.remove("fit-contain","fit-cover","fit-stretch");area.classList.add(`fit-${fit}`);if(mockupArtworkDataUrl){img.src=mockupArtworkDataUrl;area.classList.add("has-artwork")}else{img.removeAttribute("src");area.classList.remove("has-artwork")}}
$("mockupArtworkInput").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{mockupArtworkDataUrl=reader.result;mockupArtworkName=file.name;generatedMockupDataUrl="";$("downloadMockupBtn").disabled=true;$("mockupArtworkThumb").src=mockupArtworkDataUrl;$("mockupArtworkThumb").parentElement.classList.add("has-image");updatePlacedArtwork();$("sceneStatus").textContent=`Artwork loaded: ${file.name}`;log(`Mockup artwork loaded: ${file.name}`)};reader.readAsDataURL(file)});
$("mockupFit").addEventListener("change",()=>{generatedMockupDataUrl="";$("downloadMockupBtn").disabled=true;updatePlacedArtwork()});
function loadCanvasImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Could not load an image for the mockup."));img.src=src})}
function drawArtworkFit(ctx,img,x,y,w,h,fit){if(fit==="stretch"){ctx.drawImage(img,x,y,w,h);return}const scale=fit==="cover"?Math.max(w/img.width,h/img.height):Math.min(w/img.width,h/img.height),dw=img.width*scale,dh=img.height*scale,dx=x+(w-dw)/2,dy=y+(h-dh)/2;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(img,dx,dy,dw,dh);ctx.restore()}
async function generateMockup(){try{$("sceneError").textContent="";if(!sceneImageDataUrl)throw new Error("Load or choose a room scene first.");if(!sceneArea)throw new Error("Select a drawn placement first.");if(!mockupArtworkDataUrl)throw new Error("Choose an artwork image first.");$("generateMockupBtn").disabled=true;$("generateMockupBtn").textContent="Generating…";const [room,art]=await Promise.all([loadCanvasImage(sceneImageDataUrl),loadCanvasImage(mockupArtworkDataUrl)]),c=document.createElement("canvas");c.width=room.naturalWidth||room.width;c.height=room.naturalHeight||room.height;const ctx=c.getContext("2d");ctx.drawImage(room,0,0,c.width,c.height);const x=sceneArea.x*c.width,y=sceneArea.y*c.height,w=sceneArea.width*c.width,h=sceneArea.height*c.height;ctx.save();ctx.shadowColor="rgba(0,0,0,.32)";ctx.shadowBlur=Math.max(4,Math.round(c.width*.006));ctx.shadowOffsetY=Math.max(2,Math.round(c.height*.004));ctx.fillStyle="#fff";ctx.fillRect(x,y,w,h);ctx.restore();drawArtworkFit(ctx,art,x,y,w,h,$("mockupFit").value);generatedMockupDataUrl=c.toDataURL("image/png");$("downloadMockupBtn").disabled=false;$("sceneStatus").textContent=`Mockup generated for ${activePlacement()?.name||"selected placement"}.`;log("Mockup generated successfully.")}catch(e){$("sceneError").textContent=e.message;log(`ERROR: ${e.message}`)}finally{$("generateMockupBtn").disabled=false;$("generateMockupBtn").textContent="Generate Mockup"}}
$("generateMockupBtn").onclick=generateMockup;
$("downloadMockupBtn").onclick=()=>{if(!generatedMockupDataUrl)return;const a=document.createElement("a"),sceneId=$("sceneId").value||"SCENE",base=(mockupArtworkName||"artwork").replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"-"),place=(activePlacement()?.name||"placement").replace(/[^a-z0-9_-]+/gi,"-");a.href=generatedMockupDataUrl;a.download=`${sceneId}-${place}-${base}-mockup.png`;a.click();log(`Mockup downloaded: ${a.download}`)};
async function saveScene(){try{$("sceneError").textContent="";$("sceneStatus").textContent="";syncActivePlacement();const valid=placements.filter(p=>p.area&&p.area.width>=.02&&p.area.height>=.02);if(!valid.length)throw new Error("Draw at least one placement area on the room image.");$("saveSceneBtn").disabled=true;$("saveSceneBtn").textContent="Saving…";const thumbnailDataUrl=await makeSceneThumbnail(),products=[...document.querySelectorAll('[name="sceneProduct"]:checked')].map(x=>x.value),payload={id:$("sceneId").value,name:$("sceneName").value,category:$("sceneCategory").value,subcategory:$("sceneSubcategory").value,style:$("sceneStyle").value,orientation:$("sceneOrientation").value,products,placements:valid,artworkArea:valid[0].area,imageWidth:sceneImageWidth,imageHeight:sceneImageHeight,backgroundDataUrl:sceneImageDataUrl,thumbnailDataUrl};const r=await fetch("/api/scenes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),j=await r.json();if(!r.ok)throw new Error(j.error||"Scene save failed.");$("sceneStatus").textContent=`${j.scene.id} saved with ${valid.length} placement${valid.length===1?"":"s"}.`;log(`Scene ${j.scene.id} saved.`);await refreshScenes()}catch(e){$("sceneError").textContent=e.message;log(`ERROR: ${e.message}`)}finally{$("saveSceneBtn").disabled=false;$("saveSceneBtn").textContent="Save Scene"}}
async function refreshScenes(){try{const r=await fetch("/api/scenes"),j=await r.json(),scenes=j.scenes||[];$("sceneCount").textContent=`${scenes.length} scene${scenes.length===1?"":"s"}`;const list=$("sceneList");list.innerHTML=scenes.length?"":'<div class="empty" style="height:auto;padding:20px">No saved scenes yet.</div>';for(const sc of scenes){const count=(sc.placements||[sc.artworkArea]).filter(Boolean).length,card=document.createElement("div");card.className="scene-card";card.innerHTML=`<img src="${sc.thumbnail_url}?t=${encodeURIComponent(sc.createdAt||"")}" alt=""><div class="scene-card-body"><strong>${escapeHtml(sc.id)}</strong><span>${escapeHtml(sc.name)}</span><small>${escapeHtml(sc.category)} • ${count} placement${count===1?"":"s"}</small><div class="scene-card-actions"><button data-load>Load</button><button data-delete class="danger-btn">Delete</button></div></div>`;card.querySelector("[data-load]").onclick=()=>loadScene(sc);card.querySelector("[data-delete]").onclick=()=>deleteScene(sc.id);list.appendChild(card)}}catch(e){$("sceneError").textContent=e.message}}
function loadScene(sc){$("sceneId").value=sc.id;$("sceneName").value=sc.name;$("sceneCategory").value=sc.category||"";$("sceneSubcategory").value=sc.subcategory||"";$("sceneStyle").value=sc.style||"";$("sceneOrientation").value=sc.orientation||"Landscape";document.querySelectorAll('[name="sceneProduct"]').forEach(x=>x.checked=(sc.products||[]).includes(x.value));placements=(sc.placements?.length?sc.placements:[{id:placementId(),name:"Landscape Display",type:"Landscape",ratio:"3:2",area:sc.artworkArea}]).map(p=>({id:p.id||placementId(),name:p.name||`${p.orientation||p.type||"Landscape"} Display`,type:p.orientation||p.type||"Landscape",orientation:p.orientation||p.type||"Landscape",displaySize:p.displaySize||"Largest practical display for this wall",ratio:p.ratio||"free",area:p.area?{...p.area}:null}));activePlacementId=placements[0]?.id||"";const img=$("sceneBackground");img.onload=()=>{$("sceneStage").classList.add("has-image");sceneImageWidth=img.naturalWidth;sceneImageHeight=img.naturalHeight;sceneArea=activePlacement()?.area?{...activePlacement().area}:null;renderPlacementList();loadPlacementFields();renderSceneArea();updatePlacedArtwork()};sceneImageDataUrl=sc.background_url+`?t=${Date.now()}`;img.src=sceneImageDataUrl;$("sceneStatus").textContent=`Loaded ${sc.id} with ${placements.length} placement${placements.length===1?"":"s"}.`}
async function deleteScene(id){if(!confirm(`Delete scene ${id}?`))return;const r=await fetch(`/api/scenes/${encodeURIComponent(id)}`,{method:"DELETE"}),j=await r.json();if(!r.ok){$("sceneError").textContent=j.error;return}log(`Scene ${id} deleted.`);refreshScenes()}
$("addPlacementBtn").onclick=()=>addPlacement();$("deletePlacementBtn").onclick=deleteActivePlacement;$("placementName").addEventListener("input",updatePlacementFields);$("placementType").addEventListener("change",updatePlacementFields);$("placementDisplaySize").addEventListener("input",updatePlacementFields);$("placementRatio").addEventListener("change",()=>{updatePlacementFields();if(sceneArea){sceneArea=applyRatio(sceneArea,$("placementRatio").value,"se");renderSceneArea()}});$("saveSceneBtn").onclick=saveScene;$("newSceneBtn").onclick=clearSceneBuilder;clearSceneBuilder();refreshScenes();


// v1.9.0 Product Profiles, Artwork Profiles, and product-specific mockups
const originalCollectEdited=collectEdited;
collectEdited=function(){const d=originalCollectEdited();d.artwork_orientations=[...document.querySelectorAll('[name="artOrientation"]:checked')].map(x=>x.value);d.product_profiles=[...document.querySelectorAll('[name="artProfile"]:checked')].map(x=>x.value);return d};
const originalFillProduct=fillProduct;
fillProduct=function(p){originalFillProduct(p);if(p?.ng_id)loadWorkflowMockups(p.ng_id);const orientations=p.artwork_orientations?.length?p.artwork_orientations:[p.format||"Landscape"];document.querySelectorAll('[name="artOrientation"]').forEach(x=>x.checked=orientations.includes(x.value));const profiles=p.product_profiles?.length?p.product_profiles:(p.sell_as==="Canvas Only"?["signature-gallery-canvas"]:p.sell_as==="Print Only"?["premium-satin-fine-art-print"]:["signature-gallery-canvas","premium-satin-fine-art-print"]);document.querySelectorAll('[name="artProfile"]').forEach(x=>x.checked=profiles.includes(x.value))};
document.querySelectorAll('[name="artOrientation"],[name="artProfile"]').forEach(x=>x.addEventListener("change",scheduleAutoSave));

let productProfiles=[];
async function loadProductProfiles(){try{const r=await fetch("/api/product-profiles"),j=await r.json();if(!r.ok)throw new Error(j.error);productProfiles=j.profiles||[];window.productProfiles=productProfiles;renderProductProfiles();if(window.renderWorkspaceProductProfiles)window.renderWorkspaceProductProfiles()}catch(e){$("profilesError").textContent=e.message}}
function renderProductProfiles(){const box=$("profileCards");box.innerHTML="";productProfiles.forEach((p,i)=>{const card=document.createElement("div");card.className="profile-card";const families=Object.entries(p.sizes||{}).map(([k,v])=>`<div class="size-family"><strong>${escapeHtml(k)}</strong><div class="size-tags">${v.map(s=>`<span class="size-tag">${escapeHtml(s)}</span>`).join("")}</div></div>`).join("");card.innerHTML=`<h3>${escapeHtml(p.name)}</h3><div class="profile-note">${p.render==="canvas"?"Gallery-wrapped canvas • no white border":"Flat satin fine art print • 1/4-inch white border"}</div><label><input type="checkbox" data-profile-enabled ${p.enabled!==false?"checked":""}/> Enabled</label><label>White border (inches)<input type="number" min="0" step="0.25" data-profile-border value="${Number(p.borderInches||0)}"/></label>${families}`;card.querySelector("[data-profile-enabled]").onchange=e=>p.enabled=e.target.checked;card.querySelector("[data-profile-border]").oninput=e=>p.borderInches=Number(e.target.value||0);box.appendChild(card)})}
$("saveProfilesBtn").onclick=async()=>{try{$("profilesError").textContent="";const r=await fetch("/api/product-profiles",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({profiles:productProfiles})}),j=await r.json();if(!r.ok)throw new Error(j.error);$("profilesStatus").textContent="Product profiles saved.";log("Product profiles saved.")}catch(e){$("profilesError").textContent=e.message}};
loadProductProfiles();

let generatedCanvasDataUrl = "";
let generatedSatinDataUrl = "";
async function loadWorkflowMockups(ngId) {
    const gallery = $("workflowMockupGallery");

    if (!gallery) return;

    gallery.innerHTML =
        `<div class="empty">Loading mockups...</div>`;

    try {
        const response = await fetch(
            `/api/products/${encodeURIComponent(ngId)}/mockups`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not load mockups.");
        }

        gallery.innerHTML = "";

        if (!data.files.length) {
            gallery.innerHTML =
                `<div class="empty">No mockups generated yet.</div>`;
            return;
        }

data.files.forEach(file => {
    const img = document.createElement("img");
    img.src = file.url;
    img.alt = file.filename;
    img.title = file.filename;
    gallery.appendChild(img);
});

    } catch (err) {
        gallery.innerHTML =
            `<div class="empty">${err.message}</div>`;
    }
}
function normalizeMockupName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeMockupFilename(value) {
  return String(value || "mockup")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function selectedProductRooms() {
  const value = currentProduct?.rooms;

  if (Array.isArray(value)) {
    return value.map(room => String(room).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map(room => room.trim())
    .filter(Boolean);
}

function selectedProductProfiles() {
  const profiles = currentProduct?.product_profiles;

  if (Array.isArray(profiles) && profiles.length) {
    return profiles;
  }

  if (currentProduct?.sell_as === "Canvas Only") {
    return ["signature-gallery-canvas"];
  }

  if (currentProduct?.sell_as === "Print Only") {
    return ["premium-satin-fine-art-print"];
  }

  return [
    "signature-gallery-canvas",
    "premium-satin-fine-art-print"
  ];
}

function sceneMatchesRoom(scene, roomName) {
  const wanted = normalizeMockupName(roomName);

  const sceneValues = [
    scene.name,
    scene.category,
    scene.subcategory,
    scene.id
  ].map(normalizeMockupName);

  return sceneValues.some(value =>
    value === wanted ||
    value.includes(wanted) ||
    wanted.includes(value)
  );
}

function firstValidScenePlacement(scene) {
  const available = Array.isArray(scene.placements)
    ? scene.placements
    : [];

  const placement = available.find(item =>
    item?.area &&
    Number(item.area.width) >= 0.02 &&
    Number(item.area.height) >= 0.02
  );

  if (placement) {
    return placement;
  }

  if (scene.artworkArea) {
    return {
      name: "Artwork Placement",
      area: scene.artworkArea
    };
  }

  return null;
}

async function renderSceneProductMockup(
  scene,
  placement,
  profileId,
  artworkImage
) {
  const roomUrl =
    scene.background_url ||
    scene.backgroundDataUrl ||
    scene.image_url;

  if (!roomUrl) {
    throw new Error(`Scene "${scene.name || scene.id}" has no room image.`);
  }

const roomImageSource = roomUrl.startsWith("data:")
  ? roomUrl
  : roomUrl.includes("?")
    ? `${roomUrl}&t=${Date.now()}`
    : `${roomUrl}?t=${Date.now()}`;

const roomImage = await loadCanvasImage(roomImageSource);

  const canvas = document.createElement("canvas");
  canvas.width = roomImage.naturalWidth || roomImage.width;
  canvas.height = roomImage.naturalHeight || roomImage.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(roomImage, 0, 0, canvas.width, canvas.height);

  const area = placement.area;

  let x = area.x * canvas.width;
  let y = area.y * canvas.height;
  let width = area.width * canvas.width;
  let height = area.height * canvas.height;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.34)";
  ctx.shadowBlur = Math.max(5, Math.round(canvas.width * 0.006));
  ctx.shadowOffsetY = Math.max(2, Math.round(canvas.height * 0.004));

  if (profileId === "premium-satin-fine-art-print") {
    const frame = Math.max(
      4,
      Math.round(Math.min(width, height) * 0.022)
    );

    ctx.fillStyle = "#151515";
    ctx.fillRect(
      x - frame,
      y - frame,
      width + frame * 2,
      height + frame * 2
    );

    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, width, height);

    const border = Math.max(
      2,
      Math.round(Math.min(width, height) * 0.018)
    );

    drawArtworkFit(
      ctx,
      artworkImage,
      x + border,
      y + border,
      width - border * 2,
      height - border * 2,
      $("mockupFit").value
    );
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, width, height);

    drawArtworkFit(
      ctx,
      artworkImage,
      x,
      y,
      width,
      height,
      $("mockupFit").value
    );

    ctx.strokeStyle = "rgba(0,0,0,.22)";
    ctx.lineWidth = Math.max(
      1,
      Math.round(canvas.width * 0.001)
    );
    ctx.strokeRect(x, y, width, height);
  }

  ctx.restore();

  return canvas.toDataURL("image/png");
}

function downloadGeneratedMockup(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function generateAllMockups() {
  const button = $("generateMockupBtn");

  try {
    $("sceneError").textContent = "";
    $("sceneStatus").textContent = "";

    if (!currentProduct) {
      throw new Error("Open a product before generating mockups.");
    }

 if (!mockupArtworkDataUrl) {
  mockupArtworkDataUrl =
    imageDataUrl ||
    currentProduct.artwork_url ||
    $("preview").src;

  mockupArtworkName =
    originalFilename ||
    currentProduct.original_filename ||
    currentProduct.product_title ||
    "artwork";
}

if (!mockupArtworkDataUrl) {
  throw new Error("No artwork image is available for this product.");
}
    const selectedRooms = selectedProductRooms();
    const selectedProfiles = selectedProductProfiles();

    if (!selectedRooms.length) {
      throw new Error(
        "This product does not have any mockup rooms selected."
      );
    }

    if (!selectedProfiles.length) {
      throw new Error(
        "This product does not have a product profile selected."
      );
    }

    button.disabled = true;
    button.textContent = "Generating All…";

    const sceneResponse = await fetch("/api/scenes");
    const sceneResult = await sceneResponse.json();

    if (!sceneResponse.ok) {
      throw new Error(
        sceneResult.error || "Could not load saved room scenes."
      );
    }

    const scenes = sceneResult.scenes || [];
    const artworkImage = await loadCanvasImage(mockupArtworkDataUrl);

    const missingRooms = [];
    const generated = [];

    for (const roomName of selectedRooms) {
      const matchingScene = scenes.find(scene =>
        sceneMatchesRoom(scene, roomName)
      );

      if (!matchingScene) {
        missingRooms.push(roomName);
        continue;
      }

      const placement = firstValidScenePlacement(matchingScene);

      if (!placement) {
        missingRooms.push(`${roomName} — no placement`);
        continue;
      }

      for (const profileId of selectedProfiles) {
        const dataUrl = await renderSceneProductMockup(
          matchingScene,
          placement,
          profileId,
          artworkImage
        );

        const productId = safeMockupFilename(
          currentProduct.id ||
          currentProduct.ng_id ||
          currentProduct.title ||
          "product"
        );

        const roomPart = safeMockupFilename(roomName);

        const profilePart =
          profileId === "signature-gallery-canvas"
            ? "canvas"
            : "satin-print";

const ngId =
  currentProduct?.ng_id ||
  currentProduct?.ngId ||
  productId ||
  "NG-UNKNOWN";

const filename =
  `${ngId}-${roomPart}-${profilePart}-mockup.png`;

        generated.push({
          dataUrl,
          filename,
          profileId
        });
      }
    }

    if (!generated.length) {
      throw new Error(
        "No mockups were generated. The selected room names did not match any saved scenes."
      );
    }

    for (const mockup of generated) {
    const ngId =
  currentProduct?.ng_id ||
  currentProduct?.ngId;

if (!ngId) {
  throw new Error("No NG ID is available for saving mockups.");
}

const response = await fetch(
  `/api/products/${encodeURIComponent(ngId)}/mockups`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: mockup.filename,
      image: mockup.dataUrl
    })
  }
);

const result = await response.json();

if (!response.ok) {
  throw new Error(result.error || "Could not save mockup.");
}

      if (mockup.profileId === "signature-gallery-canvas") {
        generatedCanvasDataUrl = mockup.dataUrl;
      } else {
        generatedSatinDataUrl = mockup.dataUrl;
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }

    generatedMockupDataUrl =
      generated[generated.length - 1].dataUrl;

    $("downloadMockupBtn").disabled = false;
    $("downloadCanvasBtn").disabled = !generatedCanvasDataUrl;
    $("downloadSatinBtn").disabled = !generatedSatinDataUrl;

    let message =
      `${generated.length} mockup${generated.length === 1 ? "" : "s"} generated ` +
      `for ${selectedRooms.length - missingRooms.length} selected room` +
      `${selectedRooms.length - missingRooms.length === 1 ? "" : "s"}.`;

    if (missingRooms.length) {
      message += ` Missing saved scenes: ${missingRooms.join(", ")}.`;
    }

    $("sceneStatus").textContent = message;
    log(message);
  } catch (error) {
    $("sceneError").textContent = error.message;
    log(`ERROR: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Generate All Mockups";
  }
}

generateMockup = generateAllMockups;

$("generateMockupBtn").onclick = generateAllMockups;
$("generateMockupBtn").textContent = "Generate All Mockups";

const workflowButton = $("workflowGenerateMockupsBtn");

if (workflowButton) {
    workflowButton.onclick = generateAllMockups;
}
$("generateBothBtn").onclick=async()=>{try{$("sceneError").textContent="";$("generateBothBtn").disabled=true;[generatedCanvasDataUrl,generatedSatinDataUrl]=await Promise.all([renderProductMockup("signature-gallery-canvas"),renderProductMockup("premium-satin-fine-art-print")]);generatedMockupDataUrl=generatedCanvasDataUrl;$("downloadMockupBtn").disabled=false;$("downloadCanvasBtn").disabled=false;$("downloadSatinBtn").disabled=false;$("sceneStatus").textContent="Canvas and satin fine art print mockups generated.";log("Generated one canvas and one satin fine art print mockup.")}catch(e){$("sceneError").textContent=e.message}finally{$("generateBothBtn").disabled=false}};
function downloadProductMockup(data,productSlug){if(!data)return;const a=document.createElement("a"),sceneId=$("sceneId").value||"SCENE",base=(mockupArtworkName||"artwork").replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"-"),orientation=(activePlacement()?.type||"display").toLowerCase();a.href=data;a.download=`${sceneId}-${orientation}-${base}-${productSlug}.png`;a.click()}
$("downloadCanvasBtn").onclick=()=>downloadProductMockup(generatedCanvasDataUrl,"canvas");
$("downloadSatinBtn").onclick=()=>downloadProductMockup(generatedSatinDataUrl,"satin-fine-art-print");

// v1.9.2 Guided Product Workflow and field regeneration
(function initProductWorkflow(){
  const tabs=[...document.querySelectorAll("[data-product-tab]")];
  const panels=[...document.querySelectorAll(".product-tab-panel")];
  let activeStep=0;
  let regenerateField="";
  let selectedRegenerateValue="";

  const stepRequirements=[
    ["product_title","artwork_type","subjects"],
    ["short_description","long_description","shopify_tags"],
    [],
    ["rooms"],
    ["seo_title","meta_description","url_handle"],
    []
  ];

  function hasValue(id){
    const el=document.getElementById(id);
    return Boolean(el&&String(el.value||"").trim());
  }
  function stepComplete(step){
    if(step===2) return document.querySelectorAll('[name="artProfile"]:checked').length>0;
    if(step===5) return stepRequirements.slice(0,5).every((_,i)=>stepComplete(i));
    return (stepRequirements[step]||[]).every(hasValue);
  }
  function updateProgress(){
    const complete=tabs.map((_,i)=>stepComplete(i));
    tabs.forEach((btn,i)=>{
      btn.classList.toggle("complete",complete[i]);
      btn.classList.toggle("selected",i===activeStep);
      const badge=btn.querySelector("span");
      if(badge) badge.textContent=complete[i]?"✓":String(i+1);
    });
    const completed=complete.filter(Boolean).length;
    const percent=Math.round((completed/complete.length)*100);
    const percentEl=document.getElementById("workflowPercent");
    if(percentEl) percentEl.textContent=`${percent}% complete`;
    const ready=complete.slice(0,5).every(Boolean);
    const title=document.getElementById("exportReadyTitle");
    const message=document.getElementById("exportReadyMessage");
    if(title) title.textContent=ready?"Product Ready":"Product Needs Review";
    if(message) message.textContent=ready?"The core listing is complete and ready to export.":"Complete the unfinished workflow steps before your final export.";
  }
  function showStep(step){
    activeStep=Math.max(0,Math.min(tabs.length-1,Number(step)||0));
    panels.forEach(panel=>panel.hidden=panel.id!==tabs[activeStep].dataset.productTab);
    updateProgress();
    document.querySelector(".details")?.scrollTo({top:0,behavior:"smooth"});
  }
  async function saveAndMove(step){
    if(currentProduct) await saveChanges(false);
    showStep(step);
  }

  tabs.forEach((btn,i)=>btn.addEventListener("click",()=>showStep(i)));
  document.querySelectorAll("[data-next-step]").forEach(btn=>btn.addEventListener("click",()=>saveAndMove(btn.dataset.nextStep)));
  document.querySelectorAll("[data-prev-step]").forEach(btn=>btn.addEventListener("click",()=>showStep(btn.dataset.prevStep)));
  document.querySelectorAll("#results textarea,#results input,#results select").forEach(el=>el.addEventListener("input",updateProgress));

  const openSceneBuilder=document.getElementById("openSceneBuilderBtn");
  const openScene=()=>document.querySelector('[data-view="sceneView"]')?.click();
  if(openSceneBuilder) openSceneBuilder.addEventListener("click",openScene);
  document.getElementById("workflowSceneBtn")?.addEventListener("click",openScene);
  document.getElementById("workflowCsvBtn")?.addEventListener("click",exportCsv);
  document.getElementById("workflowJsonBtn")?.addEventListener("click",exportJson);
  document.getElementById("finishProductBtn")?.addEventListener("click",async()=>{await saveChanges(false);updateProgress();log(`${currentProduct?.ng_id||"Product"} workflow saved.`)});

  function updateSeoPreview(){
    const title=(document.getElementById("seo_title")?.value||document.getElementById("product_title")?.value||"Product title").trim();
    const handle=(document.getElementById("url_handle")?.value||"product-handle").trim().replace(/^\/+/,"");
    const description=(document.getElementById("meta_description")?.value||"Meta description preview").trim();
    document.getElementById("seoPreviewTitle").textContent=title||"Product title";
    document.getElementById("seoPreviewUrl").textContent=`your-store.com/products/${handle||"product-handle"}`;
    document.getElementById("seoPreviewDescription").textContent=description||"Meta description preview";
    document.getElementById("seoTitleCount").textContent=`${title.length} characters`;
    document.getElementById("metaDescriptionCount").textContent=`${description.length} characters`;
  }
  ["seo_title","product_title","url_handle","meta_description"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateSeoPreview));

  window.renderWorkspaceProductProfiles=function(){
    const box=document.getElementById("workspaceProductProfiles");
    if(!box) return;
    const selected=new Set([...document.querySelectorAll('[name="artProfile"]:checked')].map(x=>x.value));
    const orientation=[...document.querySelectorAll('[name="artOrientation"]:checked')].map(x=>x.value)[0]||selectedFormat||"Landscape";
    const orientationField=document.getElementById("analysis_orientation");
    if(orientationField) orientationField.value=orientation;
    const family=orientation==="Square"?"square":orientation==="Panorama"?"panorama":"classic";
    box.innerHTML=(window.productProfiles||productProfiles||[]).map(p=>{
      const sizes=(p.sizes&&p.sizes[family])||[];
      const enabled=selected.has(p.id);
      return `<div class="workspace-profile-card ${enabled?"":"disabled"}"><h4>${escapeHtml(p.name)}</h4><p>${enabled?"Enabled for this product":"Not selected for this product"} • ${escapeHtml(orientation)} artwork</p><strong>${family.charAt(0).toUpperCase()+family.slice(1)} sizes</strong><div class="size-tags">${sizes.map(s=>`<span class="size-tag">${escapeHtml(s)}</span>`).join("")||'<span class="size-tag">No compatible sizes</span>'}</div></div>`;
    }).join("");
    updateProgress();
  };
  document.querySelectorAll('[name="artOrientation"],[name="artProfile"]').forEach(x=>x.addEventListener("change",()=>window.renderWorkspaceProductProfiles()));

  const modal=document.getElementById("regenerateModal");
  const optionsBox=document.getElementById("regenOptions");
  const useButton=document.getElementById("useRegenOption");
  function closeModal(){modal.hidden=true;regenerateField="";selectedRegenerateValue=""}
  document.getElementById("closeRegenModal")?.addEventListener("click",closeModal);
  document.getElementById("cancelRegen")?.addEventListener("click",closeModal);
  modal?.addEventListener("click",e=>{if(e.target===modal)closeModal()});

  document.querySelectorAll("[data-regenerate]").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!currentProduct){document.getElementById("error").textContent="Create or open a product before regenerating a field.";return}
    regenerateField=btn.dataset.regenerate;
    selectedRegenerateValue="";
    document.getElementById("regenModalTitle").textContent=`Regenerate ${btn.closest('.featured-field,.field-with-action')?.querySelector('label')?.textContent||regenerateField}`;
    document.getElementById("regenLoading").hidden=false;
    document.getElementById("regenError").textContent="";
    optionsBox.innerHTML="";
    useButton.disabled=true;
    modal.hidden=false;
    try{
      const r=await fetch("/api/regenerate-field",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({field:regenerateField,product:{...currentProduct,...collectEdited()}})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Regeneration failed.");
      const options=Array.isArray(j.options)?j.options:[];
      optionsBox.innerHTML=options.map((value,i)=>`<label class="regen-option"><input type="radio" name="regenChoice" value="${i}"><span>${escapeHtml(Array.isArray(value)?value.join(", "):value)}</span></label>`).join("");
      optionsBox.querySelectorAll('input[name="regenChoice"]').forEach(input=>input.addEventListener("change",()=>{selectedRegenerateValue=options[Number(input.value)];useButton.disabled=false}));
    }catch(e){document.getElementById("regenError").textContent=e.message}
    finally{document.getElementById("regenLoading").hidden=true}
  }));
  useButton?.addEventListener("click",()=>{
    if(!regenerateField||selectedRegenerateValue==="")return;
    const el=document.getElementById(regenerateField);
    if(el){el.value=Array.isArray(selectedRegenerateValue)?selectedRegenerateValue.join(", "):selectedRegenerateValue;el.dispatchEvent(new Event("input",{bubbles:true}));scheduleAutoSave()}
    closeModal();
  });

  const previousFill=fillProduct;
  fillProduct=function(p){previousFill(p);const orientationField=document.getElementById("analysis_orientation");if(orientationField)orientationField.value=p.format||selectedFormat||"";updateSeoPreview();window.renderWorkspaceProductProfiles();updateProgress()};

  setTimeout(()=>{updateSeoPreview();window.renderWorkspaceProductProfiles();showStep(0)},400);
})();

// v2.0 Production Queue, batch import, mouse-first review
(function initV2Production(){
  const originalRefreshLibrary=refreshLibrary;
  const originalRenderLibrary=renderLibrary;
  const originalShowProduct=showProduct;
  const originalCollectEdited=collectEdited;
  const originalFillProduct=fillProduct;
 let dashboardFilter="all";
let dashboardSearch="";
let batchRunning=false;

  const statusClass=status=>({
    "Pending Analysis":"pending","Analyzing":"analyzing","Ready for Review":"ready",
    "Needs Review":"attention","Mockups Needed":"mockups","Ready to Export":"export-ready","Finished":"finished"
  }[status]||"draft");

  function openView(id){
    const btn=document.querySelector(`.nav-btn[data-view="${id}"]`);
    if(btn) btn.click();
  }
  function itemTitle(p){return p.product_title||p.original_filename?.replace(/\.[^.]+$/,'')||"Untitled artwork"}
  function queueItemMarkup(p){
  const thumb = p.artwork_url
    ? `<img src="${p.artwork_url}" alt="">`
    : `<div class="queue-no-thumb">NG</div>`;

  const progress = Math.max(
    0,
    Math.min(100, Number(p.workflow_progress || 0))
  );

  return `
    <div class="queue-thumb">${thumb}</div>

    <div class="queue-card-content">
      <div class="queue-card-header">
        <div class="queue-copy">
          <strong>${escapeHtml(itemTitle(p))}</strong>
          <span>
            ${escapeHtml(p.ng_id)} •
            ${escapeHtml(p.primary_collection || "Unassigned")}
          </span>
        </div>

        <span class="status-pill ${statusClass(p.status)}">
          ${escapeHtml(p.status || "Draft")}
        </span>
      </div>

      <div class="queue-progress-row">
        <div class="queue-progress-track">
          <div
            class="queue-progress-fill ${statusClass(p.status)}"
            style="width:${progress}%"
          ></div>
        </div>

        <small>${progress}%</small>
      </div>

      <div class="queue-card-footer">
        <small>
          Step ${Number(p.current_step || 0) + 1} of 6
        </small>

        <div class="queue-card-actions">
          <button
            type="button"
            class="continue-review-btn"
            data-review-product="${escapeHtml(p.ng_id)}"
          >
            Continue Review
          </button>

          <button
            type="button"
            class="delete-product-btn"
            title="Delete Product"
            aria-label="Delete Product"
            data-delete-product="${escapeHtml(p.ng_id)}"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  `;
}
  function updateDashboard(){
    const nextTask=rankedTasks()[0]||null;
const nextCard=document.getElementById("nextTaskCard");

if(nextCard){
  if(nextTask){
    nextCard.hidden=false;
    nextCard.querySelector("[data-next-title]").textContent=nextTask.title;
    nextCard.querySelector("[data-next-message]").textContent=nextTask.message;
    nextCard.querySelector("[data-open-next]").onclick=()=>showProduct(nextTask.product);
  }else{
    nextCard.hidden=false;
    nextCard.querySelector("[data-next-title]").textContent="Production queue complete";
    nextCard.querySelector("[data-next-message]").textContent="There are no unfinished products waiting for review.";
    nextCard.querySelector("[data-open-next]").hidden=true;
  }
}
    const counts={all:products.length,"Ready for Review":0,"Needs Review":0,"Mockups Needed":0,"Ready to Export":0,"Finished":0};
    products.forEach(p=>{if(Object.hasOwn(counts,p.status))counts[p.status]++});
    $("statImported").textContent=counts.all;
    $("statReady").textContent=counts["Ready for Review"];
    $("statNeedsReview").textContent=counts["Needs Review"];
    $("statMockups").textContent=counts["Mockups Needed"];
    $("statExport").textContent=counts["Ready to Export"];
    $("statFinished").textContent=counts["Finished"];
    const query=dashboardSearch.trim().toLowerCase();

const filtered=products.filter(p=>{
  const matchesStatus=
    dashboardFilter==="all" ||
    p.status===dashboardFilter;

  if(!matchesStatus)return false;
  if(!query)return true;

  const searchableValues=[
    p.ng_id,
    p.product_title,
    p.original_filename,
    p.primary_collection,
    p.status
  ];

  return searchableValues.some(value=>
    String(value||"").toLowerCase().includes(query)
  );
});
    $("dashboardQueueCount").textContent=`${filtered.length} item${filtered.length===1?"":"s"}`;
    const box=$("dashboardQueue");
    box.innerHTML=filtered.length?"":'<div class="empty">Nothing in this queue.</div>';
filtered.forEach(p=>{
  const row=document.createElement("div");
  row.className="dashboard-queue-item";
  row.innerHTML=queueItemMarkup(p);
  row.onclick=()=>showProduct(p);
  box.appendChild(row);
});
}

  refreshLibrary=async function(search=""){
    const r=await fetch(`/api/products?search=${encodeURIComponent(search)}`);const j=await r.json();products=j.products||[];
    $("libraryCount").textContent=`${products.length} artwork item${products.length===1?"":"s"}`;
    renderLibrary();updateDashboard();
  };
  renderLibrary=function(){
    const list=$("productList");list.innerHTML="";
    if(!products.length){list.innerHTML='<div class="empty" style="height:auto;padding:20px">No artwork imported yet.</div>';return}
    for(const p of products){const el=document.createElement("div");el.className="product-item queue-product-item"+(currentProduct?.ng_id===p.ng_id?" selected":"");el.innerHTML=queueItemMarkup(p);el.onclick=()=>showProduct(p);list.appendChild(el)}
  };
    document.addEventListener("click", async event => {
      const reviewButton = event.target.closest("[data-review-product]");

if (reviewButton) {
  event.preventDefault();
  event.stopPropagation();

  const ngId = reviewButton.dataset.reviewProduct;
  const product = products.find(p => p.ng_id === ngId);

  if (product) {
    showProduct(product);
  }

  return;
}
    const deleteButton = event.target.closest("[data-delete-product]");
    if (!deleteButton) return;

    event.preventDefault();
    event.stopPropagation();

    const ngId = deleteButton.dataset.deleteProduct;

    const confirmed = window.confirm(
      `Delete ${ngId}?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(ngId)}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Delete failed.");
      }

      if (currentProduct?.ng_id === ngId) {
        currentProduct = null;
      }

      await refreshLibrary();
    } catch (error) {
      window.alert(error.message || "Delete failed.");
    }
}, true);
showProduct=async function(p){
  try{
    const response=await fetch(
      `/api/products/${encodeURIComponent(p.ng_id)}`
    );

    const result=await response.json();

    if(!response.ok){
      throw new Error(result.error||"Could not load product.");
    }

    const fullProduct=result.product||result.data||result;

    originalShowProduct(fullProduct);
    openView("productsView");

    setTimeout(()=>{
      const step=Math.max(
        0,
        Math.min(5,Number(fullProduct.current_step||0))
      );

      document
        .querySelector(
          `[data-product-tab][data-step="${step}"]`
        )
        ?.click();
    },30);
  }catch(error){
    log(`ERROR: ${error.message}`);
    window.alert(error.message);
  }
};  showProduct=function(p){
    originalShowProduct(p);openView("productsView");
    setTimeout(()=>{const step=Math.max(0,Math.min(5,Number(p.current_step||0)));document.querySelector(`[data-product-tab][data-step="${step}"]`)?.click()},30);
  };
  collectEdited=function(){
    const data=originalCollectEdited();
    data.current_step=Number(currentProduct?.current_step||0);
    data.workflow_progress=Number(currentProduct?.workflow_progress||0);
    data.reviewed_at=currentProduct?.reviewed_at||"";
    return data;
  };

  const chipDefaults={
    artwork_type:["Photograph","Watercolor","Oil Painting","Acrylic Painting","Pencil Drawing","Charcoal Drawing","Pastel","Ink Drawing","Digital Illustration","AI Artwork","Mixed Media"],
    colors:["Black","White","Gray","Brown","Tan","Red","Orange","Yellow","Green","Blue","Purple","Pink","Gold","Silver","Earth Tones","Black & White"],
    moods:["Peaceful","Dramatic","Cozy","Vibrant","Moody","Inspirational","Playful","Romantic","Nostalgic","Bold"],
    styles:["Fine Art","Realism","Rustic","Modern","Minimalist","Vintage","Farmhouse","Boho","Contemporary","Traditional","Nature Photography"],
    gift_recipients:["Mom","Dad","Grandma","Grandpa","Wife","Husband","Son","Daughter","Brother","Sister","Teacher","Nurse","Veteran","Retiree","New Homeowner","Cabin Owner","Lake Home Owner","Nature Lover","Outdoor Enthusiast","Hunter","Fisherman","Camper","Hiker","Bird Lover","Dog Lover","Cat Lover","National Park Enthusiast","Birthday","Wedding","Anniversary","Housewarming","Graduation","Mother's Day","Father's Day","Christmas"],
    rooms:["Living Room","Bedroom","Office","Dining Room","Hallway","Entryway","Kitchen","Bathroom","Nursery","Cabin","Man Cave","She Shed","Lake Home","Guest Room","Home Library","Game Room","Studio","Waiting Room"]
  };
  const chipExpanded={};
  function parseValues(id){return ($(id)?.value||"").split(",").map(x=>x.trim()).filter(Boolean)}
  function buildChips(id){
    const field=$(id);if(!field||field.dataset.chipsReady)return;field.dataset.chipsReady="1";
    const wrap=document.createElement("div");wrap.className="smart-checks";wrap.dataset.for=id;
    field.insertAdjacentElement("afterend",wrap);
    const render=()=>{
      const selected=new Set(parseValues(id));
      const options=[...new Set([...selected,...(chipDefaults[id]||[])])];
      const limit=id==="gift_recipients"?18:id==="rooms"?12:12;
      const expanded=Boolean(chipExpanded[id]);
      const visible=expanded?options:options.slice(0,limit);
      const type=id==='artwork_type'?'radio':'checkbox';
      wrap.classList.toggle("expanded",expanded);
      wrap.innerHTML=visible.map(v=>`<label class="check-chip"><input type="${type}" name="chip-${id}" value="${escapeHtml(v)}" ${selected.has(v)?'checked':''}><span>${escapeHtml(v)}</span></label>`).join("");
      if(options.length>limit){
        const toggle=document.createElement("button");
        toggle.type="button";
        toggle.className="show-more-chips";
        toggle.textContent=expanded?"Show Less ▲":`Show ${options.length-limit} More ▼`;
        toggle.onclick=()=>{chipExpanded[id]=!expanded;render()};
        wrap.appendChild(toggle);
      }
      wrap.querySelectorAll("input").forEach(input=>input.onchange=()=>{
        let values;
        if(id==="artwork_type") values=[input.value];
        else values=[...wrap.querySelectorAll('input:checked')].map(x=>x.value);
        // When collapsed, retain checked values that are not currently visible.
        if(!expanded&&id!=="artwork_type"){
          const visibleValues=new Set(visible);
          parseValues(id).forEach(value=>{if(!visibleValues.has(value)&&!values.includes(value))values.push(value)});
        }
        field.value=values.join(", ");
        field.dispatchEvent(new Event("input",{bubbles:true}));
        scheduleAutoSave();
      });
    };
    field.addEventListener("input",render);render();
  }
  ["artwork_type","colors","moods","styles","gift_recipients","rooms"].forEach(buildChips);
  fillProduct=function(p){originalFillProduct(p);setTimeout(()=>["artwork_type","colors","moods","styles","gift_recipients","rooms"].forEach(id=>$(id)?.dispatchEvent(new Event("input"))),0)};

  function taskDetails(p){
  const title=itemTitle(p);
  const step=Number(p.current_step||0);

  if(!p.product_title||title==="Untitled artwork"){
    return {
      product:p,
      title,
      message:"Review or generate the product title.",
      priority:0
    };
  }

 const steps=[
  {
    action:"Review Artwork Analysis",
    time:"20 sec"
  },
  {
    action:"Approve Listing Title & Description",
    time:"30 sec"
  },
  {
    action:"Review Products & Sizes",
    time:"15 sec"
  },
  {
    action:"Select Mockup Rooms",
    time:"45 sec"
  },
  {
    action:"Review SEO & Export",
    time:"20 sec"
  },
  {
    action:"Finish Product",
    time:"10 sec"
  }
];


const nextStep=steps[Math.min(step,steps.length-1)];

return {
  product:p,
  title,
  message:`Next Action: ${nextStep.action}`,
  eta:nextStep.time,
  priority:step+1
};
}

function rankedTasks(excludeId=""){
  return products
    .filter(p=>p.ng_id!==excludeId&&p.status!=="Finished")
    .map(taskDetails)
    .sort((a,b)=>{
      if(a.priority!==b.priority)return a.priority-b.priority;
      return String(a.product.ng_id||"").localeCompare(
        String(b.product.ng_id||"")
      );
    });
}

function nextUnfinished(excludeId=""){
  return rankedTasks(excludeId)[0]?.product||null;
}const dashboardStats=document.querySelector(".dashboard-stats");

if(dashboardStats&&!document.getElementById("nextTaskCard")){
  const nextCard=document.createElement("section");
  nextCard.id="nextTaskCard";
  nextCard.className="next-task-card";
  nextCard.innerHTML=`
    <div>
      <span class="next-task-label">WHAT'S NEXT?</span>
      <strong data-next-title>Checking production queue...</strong>
      <p data-next-message></p>
    </div>
    <button type="button" class="next-task-button" data-open-next>
      Open Next Task
    </button>
  `;

  dashboardStats.parentNode.insertBefore(nextCard,dashboardStats);
}
$("continueReviewBtn").onclick=()=>{
  const next=nextUnfinished();

  if(next){
    showProduct(next);
  }else{
    log("Production queue is complete.");
  }
};

$("dashboardImportBtn").onclick=()=>$("batchFolderInput").click();
  $("batchImportBtn").onclick=()=>$("batchFolderInput").click();
  const queueTools=document.querySelector(".queue-tools");

if(queueTools&&!document.getElementById("dashboardSearch")){
  const search=document.createElement("input");

  search.id="dashboardSearch";
  search.className="dashboard-search";
  search.type="search";
  search.placeholder="Search title, NG ID, filename, collection, or status";
  search.autocomplete="off";
  search.setAttribute("aria-label","Search production queue");

  search.addEventListener("input",()=>{
    dashboardSearch=search.value;
    updateDashboard();
  });

  queueTools.prepend(search);
}
  document.querySelectorAll("[data-queue-filter]").forEach(btn=>btn.onclick=()=>{dashboardFilter=btn.dataset.queueFilter;document.querySelectorAll(".queue-filter").forEach(b=>b.classList.toggle("selected",b.dataset.filter===dashboardFilter));updateDashboard()});
  document.querySelectorAll(".queue-filter").forEach(btn=>btn.onclick=()=>{dashboardFilter=btn.dataset.filter;document.querySelectorAll(".queue-filter").forEach(b=>b.classList.toggle("selected",b===btn));updateDashboard()});

  async function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
  async function analyzeBatchFile(file, index, total) {
  $("batchCurrentFile").textContent = `Analyzing ${file.name}`;

  const create = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });

  const draft = await create.json();

  if (!create.ok) {
    throw new Error(
      draft.error || "Could not create artwork record."
    );
  }

  const dataUrl = await fileToDataUrl(file);
  const format = await inferFormat(file);
  const name = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ");

  await fetch(
    `/api/products/${encodeURIComponent(draft.product.ng_id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Analyzing",
        format,
        sell_as: "Canvas & Print",
        current_step: 0,
        workflow_progress: 0
      })
    }
  );

  await refreshLibrary();

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ngId: draft.product.ng_id,
      artworkName: name,
      format,
      sellAs: "Canvas & Print",
      sourceType: "Original / User Supplied",
      rightsStatus: "Licensed for Commercial Use",
      imageDataUrl: dataUrl,
      originalFilename: file.name
    })
  });

  const generated = await response.json();

  if (!response.ok) {
    throw new Error(
      `${file.name}: ${generated.error || "Analysis failed"}`
    );
  }

  const readyResponse = await fetch(
    `/api/products/${encodeURIComponent(draft.product.ng_id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Ready for Review",
        current_step: 1,
        workflow_progress: Math.round((1 / 6) * 100),
        analyzed_at: new Date().toISOString()
      })
    }
  );

  const readyResult = await readyResponse.json();

  if (!readyResponse.ok) {
    throw new Error(
      `${file.name}: ${
        readyResult.error || "Could not update review status."
      }`
    );
  }

  await refreshLibrary();

  const pct = Math.round(((index + 1) / total) * 100);

  $("batchProgressBar").style.width = `${pct}%`;
  $("batchProgressText").textContent =
    `${index + 1} of ${total} complete • ${pct}%`;
}
   
  $("batchFolderInput").onchange=async e=>{
    if(batchRunning)return;const files=[...e.target.files].filter(f=>f.type.startsWith("image/"));if(!files.length)return;
    batchRunning=true;$("batchProgressCard").hidden=false;openView("dashboardView");$("batchProgressBar").style.width="0%";$("batchProgressText").textContent=`0 of ${files.length} complete`;
    log(`Batch import started: ${files.length} images.`);
    for(let i=0;i<files.length;i++){
      try{await analyzeBatchFile(files[i],i,files.length)}catch(err){log(`ERROR: ${err.message}`)}
    }
    batchRunning=false;$("batchCurrentFile").textContent="Batch analysis complete. Ready for review.";await refreshLibrary();log("Batch analysis complete.");e.target.value="";
  };

  document.querySelectorAll("[data-next-step]").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!currentProduct)return;const next=Number(btn.dataset.nextStep);currentProduct.current_step=next;currentProduct.workflow_progress=Math.round((next/6)*100);
    currentProduct.status=next>=5?"Ready to Export":next>=3?"Mockups Needed":"Ready for Review";
    currentProduct.reviewed_at=new Date().toISOString();await saveChanges(true);updateDashboard();
  }));
  document.querySelectorAll("[data-product-tab]").forEach(btn=>btn.addEventListener("click",()=>{if(currentProduct)currentProduct.current_step=Number(btn.dataset.step||0)}));
  const finish=$("finishProductBtn");if(finish){
    finish.addEventListener("click",async()=>{
      if(!currentProduct)return;const finishedId=currentProduct.ng_id;currentProduct.status="Finished";currentProduct.current_step=5;currentProduct.workflow_progress=100;currentProduct.reviewed_at=new Date().toISOString();await saveChanges(false);await refreshLibrary();const next=nextUnfinished(finishedId);if(next)showProduct(next);else openView("dashboardView");
    });
  }

  // Start v2 on the dashboard and refresh after the older startup call completes.
  setTimeout(()=>{openView("dashboardView");refreshLibrary()},500);
  })();