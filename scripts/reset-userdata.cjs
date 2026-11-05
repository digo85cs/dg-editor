const fs = require('fs')
const path = require('path')
const os = require('os')
const userData = path.join(process.env.APPDATA || path.join(os.homedir(),'AppData','Roaming'), 'DG Editor')
if(!fs.existsSync(userData)) { console.log('nao existe'); process.exit(0) }
const bak = userData + '-backup-' + Date.now()
fs.cpSync ? fs.cpSync(userData, bak, {recursive:true}) : require('child_process').execSync('xcopy "'+userData+'" "'+bak+'" /E /I')
console.log('backup:', bak)
try { fs.rmSync ? fs.rmSync(userData,{recursive:true,force:true}) : require('child_process').execSync('rmdir /S /Q "'+userData+'"') } catch(e){}
console.log('limpo')
