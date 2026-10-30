import type { PixelSprite } from "./sprites";

/** Pixel authoring helpers. These run once on module load, never in a frame. */
class Pixels {
  rows: string[][];
  constructor(readonly w: number, readonly h: number, readonly colors: Record<string, string>) {
    this.rows = Array.from({ length: h }, () => Array(w).fill("."));
  }
  dot(x: number, y: number, c: string) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = c;
  }
  box(x: number, y: number, w: number, h: number, c: string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.dot(xx, yy, c);
  }
  line(x1: number, y1: number, x2: number, y2: number, c: string, width = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let i = 0; i <= n; i++) this.box(Math.round(x1 + (x2 - x1) * i / n), Math.round(y1 + (y2 - y1) * i / n), width, width, c);
  }
  oval(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.dot(x, y, c);
    }
  }
  poly(points: [number, number][], c: string) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi || 1) + xi) inside = !inside;
      }
      if (inside) this.dot(x, y, c);
    }
  }
  sprite(): PixelSprite { return { rows: this.rows.map((r) => r.join("")), legend: this.colors }; }
}
function hash(x: number, y: number, s = 1) {
  let v = Math.imul(x + 173 * s, 374761393) + Math.imul(y - s * 17, 668265263);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
const BARK = { t: "#8a5737", T: "#533425", b: "#b67d4e", B: "#d29a61", k: "#322b2b" };
const LEAVES: Record<string, string[]> = {
  oak: ["#234c31", "#37663a", "#528844", "#76aa4d", "#a2c865"],
  cherry: ["#70444f", "#955269", "#bd6b83", "#df8f9e", "#f4b9b3"],
  autumn: ["#613831", "#873f2e", "#ab5d32", "#cb873d", "#e9ba60"],
  moss: ["#254c35", "#3c5e35", "#587a3b", "#81974c", "#b3bb6b"],
  fruit: ["#174b34", "#296c3b", "#3e8e44", "#5baa4c", "#82c36a"],
  pine: ["#153b32", "#21543a", "#2d7748", "#419350", "#6aad60"],
  snow: ["#2f584f", "#497a6a", "#9db8b6", "#cfdddd", "#f1f6e8"],
  dark: ["#152d27", "#223e2c", "#365532", "#4c6a3c", "#6b8451"],
};
function tree(kind: string): PixelSprite {
  const p = LEAVES[kind] ?? LEAVES.oak;
  const g = new Pixels(38, 48, { ...BARK, a: p[0], c: p[1], d: p[2], e: p[3], f: p[4], v: "#aac782", V: "#7c9c63", r: "#d75346", R: "#ffb068", s: "#e8f2e7", S: "#b9d6d8" });
  // Roots, an uneven trunk and bark highlight.
  g.poly([[16,28],[22,28],[23,40],[29,46],[24,46],[20,43],[18,47],[15,44],[9,46],[14,39]], "T");
  g.poly([[17,28],[21,28],[21,41],[25,44],[20,42],[18,45],[16,42]], "t");
  g.line(18,29,18,40,"b",2); g.line(19,30,19,34,"B");
  g.line(15,38,10,33,"T",2); g.line(15,38,12,34,"t");
  if (kind === "pine" || kind === "snow") {
    for (let layer = 0; layer < 6; layer++) {
      const yy = 4 + layer * 5, width = 4 + layer * 2.6;
      g.poly([[19,yy-4],[19-width,yy+9],[19-width+4,yy+8],[19-width-1,yy+12],[19,yy+11],[19+width+2,yy+12],[19+width-2,yy+7]], "a");
      g.poly([[19,yy-3],[19-width+3,yy+8],[19,yy+7],[19+width-2,yy+9]], "c");
      g.line(19,yy,18,yy+6,"d",2); g.line(17,yy+4,14,yy+7,"e");
      if (kind === "snow") {
        g.poly([[19,yy-3],[16,yy+3],[19,yy+2],[22,yy+5],[23,yy+4],[19,yy-3]],"s");
        g.line(19-width+4,yy+8,18,yy+6,"S",2);
      }
    }
  } else {
    const blobs = [[12,14,10,11],[25,15,10,11],[19,8,10,7],[9,24,7,8],[28,25,8,7],[19,25,11,11]];
    for (let i = 0; i < blobs.length; i++) {
      const [cx, cy, rx, ry] = blobs[i];
      g.oval(cx,cy,rx,ry,"a"); g.oval(cx-1,cy-2,rx-1,ry-2,"c");
      g.oval(cx-2,cy-3,rx-3,ry-3,"d");
    }
    // Dithered leaf clusters and tiny light-facing leaf diamonds.
    for (let y = 2; y < 36; y++) for (let x = 2; x < 36; x++) {
      const ch = g.rows[y][x]; if (!"acde".includes(ch)) continue;
      const h = hash(x,y,kind.length + 7);
      if (h > 0.77) { g.dot(x,y,"e"); if (h > 0.91) { g.dot(x-1,y,"f"); g.dot(x,y+1,"d"); } }
      else if (h < 0.09) g.dot(x,y,"a");
    }
    if (kind === "fruit") for (const [x,y] of [[9,17],[26,12],[19,28],[30,24],[12,29],[21,14]]) {
      g.oval(x,y,2,2,"r");g.dot(x-1,y-1,"R");g.dot(x,y-3,"a");
    }
    if (kind === "moss") for (const [x,y] of [[7,22],[28,25],[13,32]]) {
      g.line(x,y,x-1,y+11,"V"); g.dot(x-2,y+5,"v"); g.dot(x,y+9,"v");
    }
  }
  return g.sprite();
}
function bare(snow = false): PixelSprite {
  const g = new Pixels(34,45,{...BARK,s:"#edf5eb",S:"#b3cfd0"});
  for (const [x,y] of [[5,11],[8,21],[27,9],[30,21],[18,2],[11,5]]) {
    g.line(17,35,x,y,"T",3); g.line(17,33,x,y+2,"t");
    g.line(x,y+5,x+3,y-2,"T");
    if(snow) {g.box(x-2,y,6,2,"S");g.box(x-1,y-1,4,2,"s");}
  }
  g.poly([[14,24],[20,24],[20,39],[26,43],[21,43],[18,40],[15,44],[9,43],[14,37]],"T");
  g.line(16,27,16,39,"b",2);return g.sprite();
}
function palm(): PixelSprite {
  const g = new Pixels(42,44,{...BARK,a:"#174e34",c:"#277a3e",d:"#4d9e41",e:"#87b74f"});
  g.poly([[19,16],[22,16],[21,28],[24,40],[21,42],[18,37],[17,29]],"T");
  g.line(20,20,20,35,"b",2);for(let y=23;y<38;y+=4)g.line(18,y,21,y+1,"t");
  for(const [x,y] of [[2,10],[5,21],[8,2],[32,2],[40,11],[37,23],[22,0]]) {
    g.poly([[20,13],[x,y],[x+(x<20?3:-3),y+7],[20,17]],"a");
    g.line(20,13,x,y,"c",2);g.line(20,14,x+(x<20?3:-3),y+3,"d");
  }
  g.oval(18,18,2,3,"t");g.oval(22,18,2,3,"b");return g.sprite();
}
function stump(): PixelSprite {
  const g = new Pixels(22,14,{...BARK,r:"#c89965",R:"#855b37"});
  g.poly([[5,3],[17,3],[18,9],[22,12],[17,12],[15,10],[12,14],[9,11],[3,13],[5,9]],"T");
  g.box(6,4,10,6,"t");g.oval(11,4,8,4,"r");g.oval(11,4,5,2,"R");g.oval(11,4,3,1,"r");return g.sprite();
}

const STONE = { k:"#38353a",a:"#59535a",b:"#80767a",c:"#a39a94",d:"#c4b9a2",e:"#dfd4b4",w:"#b48c62",W:"#75533e",l:"#4f7e43",L:"#8cad56",s:"#eff4e8",S:"#b6cbd0",r:"#9d613f",R:"#d2a166",i:"#6fc7de" };
function masonry(g: Pixels,x:number,y:number,w:number,h:number, variant=0) {
  g.box(x,y,w,h,"a");
  for(let yy=y;yy<y+h;yy+=5)for(let xx=x-((Math.floor((yy-y)/5)%2)*4);xx<x+w;xx+=8){
    const left=Math.max(x,xx),right=Math.min(x+w,xx+7); if(right<=left)continue;
    const col=hash(xx,yy,variant)>0.5?"b":"c";
    g.box(left,yy,right-left,4,col);g.box(left,yy,right-left,1,"d");
    if(hash(xx,yy)>0.75)g.dot(left+1,yy+2,"e");
  }
}
function ruin(kind:string): PixelSprite {
  const g = new Pixels(58,56,STONE);
  // Foundation rubble, left as clear walkable ground around the entrance.
  for(let i=0;i<12;i++){const x=3+Math.floor(hash(i,8)*51),y=43+Math.floor(hash(i,12)*11);g.oval(x,y,2+i%2,1+i%2,"a");g.dot(x-1,y-1,"c");}
  if(kind==="arch" || kind==="roots") {
    masonry(g,9,24,12,25);masonry(g,37,23,12,26);
    masonry(g,15,12,29,13);masonry(g,21,7,17,6);
    g.poly([[21,24],[37,24],[37,41],[21,41]],".");
    g.box(24,18,10,4,"a");g.box(26,19,6,2,"k");
    if(kind==="roots"){
      g.line(33,16,28,47,"W",5);g.line(33,16,28,43,"w",2);
      g.line(29,36,17,51,"W",2);g.line(30,40,39,51,"W",2);
      for(const [x,y,rx,ry] of [[23,9,13,8],[35,8,13,8],[40,16,10,9],[18,18,11,8]]){g.oval(x,y,rx,ry,"l");g.oval(x-2,y-3,rx-2,ry-2,"L");}
      for(let i=0;i<5;i++)g.line(14+i*6,21,12+i*6,30+i%3*3,"L");
    }
  } else if(kind==="tower" || kind==="spiral") {
    masonry(g,13,18,32,31,2);masonry(g,18,8,22,13,2);masonry(g,23,3,12,7,2);
    g.box(23,32,12,17,".");g.oval(29,32,6,6,".");g.box(26,12,5,9,"k");
    g.line(37,12,43,43,"l",2);g.line(36,12,41,41,"L");
    if(kind==="spiral")for(let i=0;i<7;i++){g.box(6+i*3,45-i*4,13,3,"a");g.box(6+i*3,45-i*4,13,1,"d");}
  } else if(kind==="garden") {
    masonry(g,6,22,9,28);masonry(g,42,18,9,32);masonry(g,12,12,15,8);
    masonry(g,34,9,12,8);g.box(21,18,4,7,"a");
    g.line(11,27,22,10,"W",3);g.line(46,43,39,10,"W",3);
    for(const [x,y] of [[13,15],[19,9],[39,15],[44,26],[46,38]]){g.oval(x,y,6,4,"l");g.oval(x-1,y-1,4,2,"L");}
  } else if(kind==="columns") {
    for(const [x,y,h] of [[7,25,24],[18,15,35],[37,12,36],[48,28,21]]) {
      g.box(x,y,4,h,"c");g.box(x,y,2,h,"e");g.box(x-2,y-2,8,3,"d");g.box(x-1,y+h-2,7,3,"d");
    }
    g.box(18,9,26,5,"d");g.box(19,9,24,1,"e");g.box(31,12,3,4,".");
  } else if(kind==="circle") {
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const x=29+Math.round(Math.cos(a)*19),y=33+Math.round(Math.sin(a)*13);masonry(g,x-4,y-8,8,13,i);g.oval(x,y-8,5,3,"S");g.oval(x-1,y-9,4,2,"s");}
  } else {
    // ochre cave mouth
    g.oval(29,31,23,21,"r");g.oval(28,27,21,19,"R");
    for(let i=0;i<15;i++){const x=10+Math.floor(hash(i,2)*38),y=12+Math.floor(hash(i,6)*32);g.box(x,y,4,2,i%2?"w":"r");}
    g.oval(29,40,10,12,"W");g.box(19,40,20,12,"W");g.box(24,39,10,13,"k");
  }
  return g.sprite();
}
function totem(): PixelSprite {
  const g=new Pixels(22,37,{...BARK,i:"#68c8dd",I:"#b3f8f3",s:"#edf3e7"});
  g.box(7,9,8,26,"T");g.box(8,10,6,24,"t");g.box(9,12,1,20,"b");
  g.poly([[7,13],[0,10],[4,19],[8,20]],"t");g.poly([[15,13],[22,10],[18,19],[14,20]],"t");
  g.oval(11,7,8,7,"T");g.oval(11,6,6,5,"t");g.oval(6,1,2,2,"t");g.oval(16,1,2,2,"t");
  g.box(7,6,2,2,"k");g.box(13,6,2,2,"k");g.box(10,9,3,2,"T");
  g.oval(11,23,4,5,"T");g.oval(11,22,2,3,"i");g.dot(10,21,"I");g.box(5,0,12,1,"s");return g.sprite();
}
function snowman(): PixelSprite {
  const g=new Pixels(18,26,{s:"#f0f5ed",S:"#b8d2d4",h:"#6d4b36",H:"#40302b",r:"#c3503b",o:"#e9a54a",k:"#33404c"});
  g.oval(9,19,7,6,"S");g.oval(8,18,6,5,"s");g.oval(9,9,5,5,"S");g.oval(8,8,4,4,"s");
  g.box(5,1,7,5,"h");g.box(3,5,12,2,"H");g.box(5,13,9,2,"r");g.box(11,14,2,5,"r");
  g.dot(7,9,"k");g.dot(10,9,"k");g.line(10,10,15,11,"o");g.dot(9,18,"k");g.dot(9,22,"k");
  g.line(3,16,0,12,"h");g.line(15,16,17,12,"h");return g.sprite();
}
function iceDeity(): PixelSprite {
  const g=new Pixels(74,70,{a:"#2c6b9c",b:"#4d9cc0",c:"#7bcee3",d:"#b8eff4",e:"#f0ffff",k:"#214260"});
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const x=37+Math.cos(a)*33,y=31+Math.sin(a)*25;
    g.line(37,58,x,y,"a",2);g.line(37,55,x,y,"c");
    g.line(x,y,x+(x<37?-3:3),y-7,"b");g.dot(x,y-2,"e");
  }
  g.poly([[35,19],[40,19],[42,49],[47,63],[38,68],[29,64],[34,50]],"a");
  g.poly([[36,20],[39,20],[39,50],[42,64],[37,66],[34,61]],"c");g.line(36,30,36,59,"d");
  g.poly([[29,17],[33,9],[40,8],[46,16],[43,28],[36,32],[30,26]],"b");
  g.poly([[31,16],[35,11],[39,11],[43,16],[40,27],[36,29],[32,25]],"c");
  g.box(32,19,3,2,"a");g.box(39,19,3,2,"a");g.dot(33,19,"e");g.dot(40,19,"e");g.line(35,26,39,26,"a");
  return g.sprite();
}
function bat(): PixelSprite {
  const g=new Pixels(30,24,{k:"#332734",a:"#564050",b:"#80505e",r:"#b25158",R:"#e8847a",e:"#ffb63f",w:"#f5e4c5"});
  g.poly([[13,12],[5,3],[0,4],[1,16],[5,13],[7,18],[13,16]],"k");g.poly([[17,12],[25,3],[30,4],[29,16],[25,13],[23,18],[17,16]],"k");
  g.poly([[12,11],[5,5],[2,6],[3,12],[7,11],[10,16]],"r");g.poly([[18,11],[25,5],[28,6],[27,12],[23,11],[20,16]],"r");
  g.oval(15,15,6,7,"a");g.oval(15,14,4,5,"b");g.poly([[10,9],[9,1],[14,7],[18,7],[22,1],[20,11]],"a");
  g.box(10,10,3,2,"e");g.box(17,10,3,2,"e");g.box(12,15,6,2,"k");g.dot(12,16,"w");g.dot(17,16,"w");return g.sprite();
}
function slime(): PixelSprite {
  const g=new Pixels(25,21,{a:"#297eae",b:"#3ea8ce",c:"#79d5ec",d:"#bbf8fc",e:"#fff0a0",k:"#4c523f",w:"#f0ffff"});
  g.oval(12,12,11,8,"a");g.oval(12,9,9,8,"b");g.oval(10,8,7,6,"c");g.oval(7,6,3,2,"d");
  g.oval(8,10,2,3,"k");g.oval(17,10,2,3,"k");g.oval(8,9,1,2,"e");g.oval(17,9,1,2,"e");
  g.line(10,15,14,15,"a");g.dot(12,16,"d");for(const [x,y] of [[1,3],[21,1],[23,9]]){g.line(x-1,y,x+1,y,"w");g.line(x,y-1,x,y+1,"w");}return g.sprite();
}
function demon(): PixelSprite {
  const g=new Pixels(30,35,{a:"#48283c",b:"#8c3543",c:"#c65340",d:"#ed8a3f",e:"#ffd278",k:"#2b2533",s:"#96adc4",w:"#f7dfbc"});
  g.poly([[9,15],[2,10],[0,16],[3,26],[7,22],[9,29],[13,21]],"a");g.poly([[21,15],[28,10],[30,16],[27,26],[23,22],[21,29],[17,21]],"a");
  g.oval(15,20,7,10,"a");g.oval(15,19,5,8,"b");g.poly([[9,11],[8,1],[12,6],[18,6],[22,1],[21,13]],"a");
  g.oval(15,11,6,6,"b");g.box(10,10,4,2,"e");g.box(17,10,4,2,"e");g.box(12,15,6,2,"k");g.dot(13,15,"w");g.dot(17,15,"w");
  g.line(10,27,8,33,"k",3);g.line(19,27,21,33,"k",3);
  for(const x of [2,24]){g.box(x,18,4,7,"c");g.box(x+1,15,2,5,"d");g.dot(x+2,14,"e");}
  return g.sprite();
}
function gear(kind:string): PixelSprite {
  const g=new Pixels(18,20,{a:"#513a2d",b:"#8c5b3a",c:"#bb8450",d:"#dcb47b",e:"#f7e3ad",i:"#59bcd0",I:"#c0f4f1",g:"#476f59",G:"#729a6d"});
  if(kind==="harness"){
    g.line(3,2,14,17,"a",3);g.line(4,2,15,17,"c");g.line(14,2,3,17,"a",3);g.line(14,2,3,17,"b");g.box(6,7,6,5,"a");g.box(7,8,4,3,"d");g.box(8,9,2,1,"a");
  }else if(kind==="coat"){
    g.poly([[4,2],[7,1],[9,4],[11,1],[14,2],[17,9],[14,11],[13,17],[5,17],[4,11],[1,9]],"a");
    g.poly([[5,3],[8,3],[9,6],[10,3],[13,3],[14,14],[12,17],[6,17]],"g");g.box(5,3,2,3,"d");g.box(11,3,2,3,"d");g.box(8,7,2,9,"G");g.box(5,13,8,2,"b");g.box(8,13,2,2,"e");
  }else{
    g.oval(9,7,6,6,"c");g.oval(9,6,4,4,"a");g.poly([[9,7],[14,12],[11,18],[7,18],[4,12]],"b");g.poly([[9,8],[12,12],[10,16],[7,15],[6,12]],"i");g.line(8,10,7,13,"I");
  }
  return g.sprite();
}

function frostedRock(ore = false): PixelSprite {
  const g = new Pixels(24,17,{a:"#536b7b",b:"#829ba7",c:"#abc5ce",d:"#d6e8e7",e:"#f4faf0",g:"#d1a45e",G:"#f4d49a"});
  g.poly([[2,12],[4,7],[8,2],[16,1],[21,6],[23,13],[20,16],[5,16]],"a");
  g.poly([[3,12],[6,5],[10,2],[16,3],[21,8],[21,13],[13,15]],"b");
  g.poly([[6,7],[8,3],[16,2],[20,7],[17,9],[13,7],[10,9]],"d");
  g.line(8,3,15,3,"e",2);g.line(6,6,9,5,"e");
  g.box(7,12,4,1,"c");g.box(18,10,2,2,"c");
  if(ore){g.box(11,10,3,3,"g");g.box(12,10,2,1,"G");g.box(18,13,2,2,"g");}
  return g.sprite();
}
function snowBush(): PixelSprite {
  const g = new Pixels(22,16,{a:"#254839",b:"#41765c",c:"#b6d5d1",d:"#f1f6eb"});
  for(const [x,y,r] of [[6,8,5],[15,8,5],[10,5,5],[10,11,7]]){g.oval(x,y,r,4,"a");g.oval(x-1,y-1,r-1,3,"b");g.oval(x-1,y-2,r-1,2,"c");g.line(x-2,y-3,x+1,y-3,"d");}
  return g.sprite();
}

function necroKing(): PixelSprite {
  const g=new Pixels(76,62,{k:"#201d25",a:"#4b4652",b:"#706875",c:"#a8a29a",d:"#dcd6c2",e:"#fff4cf",g:"#7c9f4e",G:"#b7d06b",r:"#6a252d",R:"#b14342",y:"#d7a83d",Y:"#ffe48a"});
  // giant rib cage, arms and hands
  for(let i=0;i<7;i++){const yy=23+i*4;g.line(34,yy,18-i,yy-7+i,"c",2);g.line(42,yy,58+i,yy-7+i,"c",2);g.line(35,yy,24-i,yy-3,"d");g.line(41,yy,52+i,yy-3,"d");}
  g.line(34,20,30,51,"c",5);g.line(42,20,48,51,"c",5);g.line(30,50,13,57,"d",4);g.line(48,50,65,57,"d",4);
  for(let i=0;i<5;i++){g.line(13,57,4+i*3,61-i%2,"c");g.line(65,57,72-i*3,61-i%2,"c");}
  // skull
  g.oval(38,17,14,13,"c");g.oval(38,15,12,11,"d");g.box(27,17,22,8,"d");
  g.oval(33,16,4,4,"k");g.oval(43,16,4,4,"k");g.poly([[38,18],[35,23],[41,23]],"a");
  for(let i=0;i<6;i++)g.box(32+i*3,26,2,4,"e");g.box(31,25,16,2,"a");
  // crown and laurel
  g.box(26,5,24,5,"y");g.poly([[26,6],[27,0],[32,7],[38,0],[43,7],[49,1],[50,9]],"y");
  g.line(28,6,48,6,"Y",2);g.dot(32,7,"R");g.dot(38,5,"G");g.dot(45,7,"R");
  for(const side of [-1,1])for(let i=0;i<6;i++){const x=38+side*(15+i),y=12+i*3;g.oval(x,y,3,2,i%2?"g":"G");}
  return g.sprite();
}
function necroTower(size=1): PixelSprite {
  const w=Math.round(34*size),h=Math.round(52*size),g=new Pixels(w,h,{k:"#17171c",a:"#373640",b:"#565562",c:"#777682",d:"#a8a29a",e:"#e7dfc7",g:"#59bb5a",G:"#a7e36f",r:"#561d28"});
  const cx=w/2;g.poly([[cx-11*size,12*size],[cx+11*size,12*size],[cx+14*size,h-2],[cx-14*size,h-2]],"a");
  for(let y=Math.round(15*size);y<h-4;y+=Math.max(3,Math.round(5*size)))for(let x=Math.round(cx-10*size);x<cx+10*size;x+=Math.max(4,Math.round(7*size))){g.box(x,y,Math.max(3,Math.round(6*size)),Math.max(2,Math.round(4*size)),(x+y)%2?"b":"c");}
  g.oval(cx,11*size,11*size,9*size,"d");g.oval(cx,10*size,9*size,8*size,"e");g.oval(cx-4*size,10*size,3*size,3*size,"k");g.oval(cx+4*size,10*size,3*size,3*size,"k");
  g.poly([[cx,11*size],[cx-2*size,15*size],[cx+2*size,15*size]],"a");
  g.box(Math.round(cx-6*size),Math.round(27*size),Math.round(12*size),Math.round(15*size),"k");g.oval(cx,27*size,6*size,5*size,"k");
  g.oval(cx,22*size,3*size,5*size,"g");g.oval(cx,21*size,1.5*size,3*size,"G");
  for(const side of [-1,1]){g.line(cx+side*10*size,18*size,cx+side*16*size,31*size,"k",3);g.line(cx+side*13*size,24*size,cx+side*18*size,20*size,"r");}
  return g.sprite();
}
function grave(): PixelSprite {
  const g=new Pixels(15,19,{k:"#282833",a:"#454653",b:"#666978",c:"#9295a0",g:"#5d7b4d"});
  g.poly([[4,4],[6,1],[9,1],[12,4],[12,16],[3,16],[3,5]],"a");g.poly([[5,4],[7,2],[9,2],[11,4],[11,14],[5,14]],"b");
  g.box(6,6,4,2,"c");g.box(7,5,2,6,"c");g.box(1,16,13,3,"k");g.box(0,17,5,2,"g");g.box(10,16,5,2,"g");return g.sprite();
}
function necroTree(): PixelSprite {
  const g=new Pixels(42,50,{k:"#16171a",a:"#2a292b",b:"#443536",r:"#621b27",R:"#a72a32",g:"#75b653"});
  g.poly([[17,24],[24,23],[24,40],[31,48],[25,47],[21,42],[17,49],[11,47],[16,39]],"k");g.poly([[19,24],[22,24],[22,41],[25,45],[20,42],[17,46],[18,34]],"b");
  const branches=[[20,30,4,8],[20,27,2,18],[22,28,36,10],[18,28,7,14],[21,20,31,2],[17,24,2,25],[23,21,40,25],[15,20,9,2]];
  for(const q of branches){g.line(q[0],q[1],q[2],q[3],"k",3);g.line(q[0],q[1],q[2],q[3],"a");}
  for(const [x,y] of [[4,8],[31,2],[36,10],[7,14],[38,25],[2,24]]){g.line(x,y,x+3,y+2,"r");g.dot(x+3,y+2,"R");}
  g.dot(21,35,"g");g.dot(22,37,"g");return g.sprite();
}
function toxicPool(): PixelSprite {
  const g=new Pixels(32,18,{k:"#253128",a:"#487842",b:"#68ae54",c:"#91d66a",d:"#c5f489"});
  g.oval(16,11,15,7,"k");g.oval(16,10,13,6,"a");g.oval(14,9,10,4,"b");g.oval(12,7,5,2,"c");
  for(const [x,y] of [[6,9],[20,7],[25,12]]){g.oval(x,y,2,2,"c");g.dot(x-1,y-1,"d");}return g.sprite();
}

function fenceModel(kind:string,gate=false): PixelSprite {
  const g=new Pixels(gate?30:28,22,{k:"#282329",a:"#5a3827",b:"#82543a",c:"#b57d53",d:"#d6aa72",e:"#f1d69a",s:"#5d6870",S:"#9ba8ad",r:"#8e3437",R:"#d45b57",l:"#456c37",L:"#79a94c",v:"#a5c96b",w:"#737980",W:"#b7bec1"});
  if(kind==="stone"){
    const width=gate?30:28;for(let y=5;y<21;y+=5)for(let x=(y%10?0:-3);x<width;x+=8){g.box(Math.max(0,x),y,Math.min(7,width-x),4,(x+y)%3?"w":"s");g.box(Math.max(0,x),y,Math.min(7,width-x),1,"W");}
    if(gate){g.box(0,1,6,21,"s");g.box(24,1,6,21,"s");g.box(1,2,4,18,"W");g.box(25,2,4,18,"W");g.box(8,8,14,14,"a");g.box(10,9,10,13,"b");g.box(13,9,2,13,"d");}
  }else if(kind==="hedge"){
    g.box(1,8,g.w-2,12,"a");for(let x=2;x<g.w-2;x+=5){g.line(x,7,x+5,20,"c",2);g.line(x+5,7,x,20,"c",2);}
    for(let i=0;i<30;i++){const x=1+Math.floor(hash(i,4)*g.w-2),y=3+Math.floor(hash(i,8)*16);g.oval(x,y,3,2,i%3?"l":"L");if(i%6===0)g.dot(x,y-1,"v");}
    if(gate){g.box(0,1,4,21,"a");g.box(26,1,4,21,"a");g.box(5,5,20,17,".");g.line(5,7,14,20,"c",2);g.line(24,7,15,20,"c",2);}
  }else{
    const count=gate?6:5,span=(g.w-4)/count;
    for(let i=0;i<count;i++){const x=Math.round(2+i*span),col=kind==="rustic"?(i%2?"b":"c"):(i%2?"r":"R");g.box(x,4,Math.max(3,Math.round(span-1)),18,col);g.box(x+1,5,1,15,kind==="rustic"?"d":"e");if(kind!=="rustic"){g.poly([[x,4],[x+span/2,0],[x+span-1,4]],col);}}
    for(const y of kind==="rustic"?[8,17]:[7,13,19]){g.box(0,y,g.w,3,"k");g.box(1,y,g.w-2,1,"s");}
    if(gate){g.box(0,1,5,21,"a");g.box(25,1,5,21,"a");g.box(14,8,2,14,"k");}
  }
  return g.sprite();
}

function lizardWarrior(): PixelSprite {
  const g=new Pixels(26,31,{k:"#17252b",a:"#244842",b:"#36705a",c:"#55a16a",d:"#88cc82",e:"#ff5743",w:"#e9e5c8",m:"#5d4934",M:"#a67b4c",s:"#9eb8ce",S:"#d9eef3",r:"#6a2831"});
  g.poly([[8,8],[5,3],[10,5],[13,1],[15,6],[21,3],[18,10]],"a");g.oval(13,10,8,7,"a");g.oval(13,9,6,5,"b");
  g.box(8,8,3,2,"e");g.box(16,8,3,2,"e");g.dot(9,8,"w");g.dot(17,8,"w");g.box(11,13,5,2,"k");g.dot(12,13,"w");g.dot(15,13,"w");
  g.poly([[7,15],[19,15],[21,25],[17,29],[9,29],[5,25]],"a");g.box(8,16,10,8,"b");g.box(9,17,8,5,"c");
  g.box(6,18,4,7,"a");g.box(17,18,4,7,"a");g.box(5,24,4,3,"c");g.box(18,24,4,3,"c");
  g.box(9,22,8,3,"m");g.box(12,22,2,3,"M");g.line(9,17,17,23,"r",2);
  g.box(8,27,4,4,"a");g.box(15,27,4,4,"a");g.poly([[17,26],[25,28],[21,30],[17,29]],"b");
  // bone spear
  g.line(21,3,4,28,"m",2);g.line(21,3,4,28,"M");g.poly([[22,1],[25,0],[23,5]],"S");g.dot(23,1,"w");
  return g.sprite();
}
function lizardShrine(): PixelSprite {
  const g=new Pixels(52,48,{k:"#26322d",a:"#4d5c4c",b:"#748060",c:"#a6a27a",d:"#cec69a",l:"#376a42",L:"#70a94d",r:"#884330",R:"#c86a42",e:"#e6d267"});
  for(const x of [6,38]){g.box(x,17,9,29,"a");g.box(x+2,15,5,29,"b");g.box(x-2,13,13,5,"c");for(let y=21;y<43;y+=6)g.box(x+1,y,7,2,"d");}
  g.box(11,9,30,8,"a");g.box(13,10,26,5,"b");g.line(13,9,39,9,"d",2);g.poly([[20,9],[26,1],[32,9]],"r");g.poly([[23,9],[26,4],[29,9]],"R");
  g.oval(26,27,9,8,"a");g.oval(26,25,6,5,"b");g.box(22,24,3,2,"e");g.box(28,24,3,2,"e");g.poly([[26,27],[23,32],[29,32]],"k");
  for(const [x,y] of [[4,7],[45,8],[7,29],[44,33]]){g.line(x,y,x-2,y+12,"l",2);g.oval(x-2,y+5,3,2,"L");g.oval(x,y+9,3,2,"L");}
  g.box(0,45,52,3,"k");return g.sprite();
}
function survivorHome(): PixelSprite {
  const g=new Pixels(54,44,{k:"#342a29",a:"#5c5961",b:"#7c7b82",c:"#a5a3a0",d:"#d7cdb5",r:"#7a3029",R:"#ad4435",o:"#d06a45",w:"#efe2c3",W:"#c8b68e",h:"#6c412c",H:"#a56a43",y:"#7aa4d4",Y:"#c2d9ed",l:"#617b42"});
  // stone facade and foundation
  g.box(5,24,44,17,"a");for(let yy=25;yy<40;yy+=5)for(let xx=5-(yy%10?0:4);xx<49;xx+=9){g.box(Math.max(5,xx),yy,Math.min(8,49-xx),4,(xx+yy)%3?"b":"c");g.box(Math.max(5,xx),yy,Math.min(8,49-xx),1,"d");}
  g.box(3,40,48,3,"k");g.box(5,40,44,2,"W");
  // steep red roof with a side wing
  for(let row=0;row<18;row++){const left=Math.max(1,25-row*2),right=Math.min(52,29+row*2);g.box(left,5+row,right-left,1,row%3?"R":"r");if(row%4===0)for(let x=left;x<right;x+=6)g.box(x,5+row,4,1,"o");}
  g.poly([[27,4],[52,19],[50,27],[27,13]],"r");g.line(27,4,27,24,"o",2);g.line(2,23,52,23,"k",2);
  // door, windows, timber
  g.box(37,28,8,13,"h");g.box(39,29,5,11,"H");g.dot(43,35,"d");
  for(const x of [10,23]){g.box(x,28,8,8,"h");g.box(x+1,29,6,6,"y");g.box(x+3,29,1,6,"Y");g.box(x+1,32,6,1,"Y");}
  g.box(13,15,7,6,"h");g.box(14,16,5,4,"y");g.box(16,16,1,4,"Y");
  // chimney and moss at edges
  g.box(8,5,6,12,"a");g.box(9,4,5,10,"b");g.box(8,3,7,3,"k");g.box(6,38,5,3,"l");g.box(46,37,5,4,"l");
  return g.sprite();
}

export const EXPANSION_SPRITES: Record<string, PixelSprite> = {
  tree: tree("oak"), pine: tree("pine"), tree_dark: tree("dark"), pine_dark: tree("dark"),
  tree_cherry: tree("cherry"), tree_autumn: tree("autumn"), tree_moss: tree("moss"), tree_fruit: tree("fruit"),
  tree_snow: tree("snow"), tree_dead: bare(), tree_bare_snow: bare(true), tree_palm: palm(), stump: stump(),
  ruin_roots: ruin("roots"), ruin_tower: ruin("tower"), ruin_arch: ruin("arch"), ruin_garden: ruin("garden"),
  ruin_spiral: ruin("spiral"), ruin_columns: ruin("columns"), ruin_circle: ruin("circle"), ruin_amber: ruin("amber"),
  winter_totem: totem(), snowman: snowman(), ice_deity: iceDeity(), demonbat: bat(), iceslime: slime(), emberdemon: demon(),
  equip_harness: gear("harness"), equip_coat: gear("coat"), equip_charm: gear("charm"),
  frost_rock: frostedRock(), frost_ore: frostedRock(true), snow_bush: snowBush(),
  necro_king: necroKing(), necro_tower: necroTower(), necro_shrine: necroTower(.72), necro_grave: grave(), necro_tree: necroTree(), toxic_pool: toxicPool(),
  fence_rustic: fenceModel("rustic"), fence_palisade: fenceModel("palisade"), fence_stone: fenceModel("stone"), fence_hedge: fenceModel("hedge"),
  gate_rustic: fenceModel("rustic",true), gate_palisade: fenceModel("palisade",true), gate_stone: fenceModel("stone",true), gate_hedge: fenceModel("hedge",true),
  lizardman: lizardWarrior(), lizard_shrine: lizardShrine(), house: survivorHome(),
};
