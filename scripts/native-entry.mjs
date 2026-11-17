import {Capacitor,registerPlugin} from '@capacitor/core';
import {Geolocation} from '@capacitor/geolocation';
import {App} from '@capacitor/app';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
export {Capacitor,Geolocation,App};
export const SkyOrientation=registerPlugin('SkyOrientation');
export const SkyCamera=registerPlugin('SkyCamera');
export const WeatherAlerts=registerPlugin('WeatherAlerts');
export async function nativeExport(data,filename){
 const file=await Filesystem.writeFile({path:'exports/'+filename,recursive:true,data:JSON.stringify(data,null,2),directory:Directory.Cache,encoding:Encoding.UTF8});
 await Share.share({title:'Резервная копия DeepSky',url:file.uri,dialogTitle:'Сохранить резервную копию'});
}
