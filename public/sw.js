self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{
let d={title:'Sabor Goo',body:'Tienes una nueva notificacion',url:'/',tag:'sabor-goo-alerta',playAlertSound:true};
if(e.data){try{d={...d,...e.data.json()};}catch{d.body=e.data.text();}}
const p1=self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{cs.forEach(c=>c.postMessage({type:'SABOR_GOO_PUSH_SOUND',payload:d}));});
const p2=self.registration.showNotification(d.title,{body:d.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:d.tag||'sabor-goo-alerta',renotify:true,requireInteraction:true,vibrate:[800,200,800,200,800,200,1200],data:{url:d.url||'/'}});
e.waitUntil(Promise.all([p1,p2]));
});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=e.notification.data&&e.notification.data.url||'/';e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c){c.navigate(u);return c.focus();}}if(self.clients.openWindow)return self.clients.openWindow(u);}));});
