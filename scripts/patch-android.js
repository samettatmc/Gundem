// Android projesine mikrofon izni, ses tanıma servisi ve sürüm numarasını ekler.
const fs = require('fs'), path = require('path');
const build = +process.env.BUILD_NUMBER || 1;
const man = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let m = fs.readFileSync(man, 'utf8');
if (!m.includes('RECORD_AUDIO')) m = m.replace('<application', '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <application');
if (!m.includes('RecognitionService')) m = m.replace('<application', '<queries>\n        <intent><action android:name="android.speech.RecognitionService" /></intent>\n    </queries>\n    <application');
fs.writeFileSync(man, m);
const gr = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gr, 'utf8');
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + build).replace(/versionName\s+"[^"]*"/, 'versionName "1.0.' + build + '"');
fs.writeFileSync(gr, g);
console.log('android hazır, sürüm 1.0.' + build);
