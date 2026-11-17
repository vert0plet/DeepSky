package ru.egorych.deepsky;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Native integration smoke test: launch packaged assets and read the rendered DOM. */
@RunWith(AndroidJUnit4.class)
public class StartupTest {
    @Test public void shareProviderIsLimitedToObservationExports() {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String authority = context.getPackageName() + ".fileprovider";
        java.io.File export = new java.io.File(context.getCacheDir(), "exports/observation.json");
        android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(context, authority, export);
        assertEquals("content", uri.getScheme());
        assertEquals(authority, uri.getAuthority());
        assertThrows(IllegalArgumentException.class, () -> androidx.core.content.FileProvider.getUriForFile(
            context, authority, new java.io.File(context.getCacheDir(), "unrelated.json")));
    }

    @Test public void fullscreenDoesNotReserveOpaqueSystemBarStrips() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Boolean> fullscreen=new AtomicReference<>(false);
            for(int i=0;i<30;i++) {
                scenario.onActivity(a->{
                    android.view.View content=a.findViewById(android.R.id.content);
                    androidx.core.view.WindowInsetsCompat insets=androidx.core.view.ViewCompat.getRootWindowInsets(content);
                    fullscreen.set(insets!=null&&!insets.isVisible(androidx.core.view.WindowInsetsCompat.Type.statusBars())&&!insets.isVisible(androidx.core.view.WindowInsetsCompat.Type.navigationBars())&&content.getPaddingTop()==0);
                });
                if(fullscreen.get())break;
                Thread.sleep(100);
            }
            assertTrue("System bars must be hidden without a reserved top strip",fullscreen.get());
        }
    }
    @Test public void packagedAtlasLoadsAndOrientationPluginIsRegistered() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final AtomicReference<String> result = new AtomicReference<>("");
            for (int i=0;i<100;i++) {
                CountDownLatch latch = new CountDownLatch(1);
                scenario.onActivity(activity -> {
                    assertNotNull(activity.getBridge().getPlugin("SkyOrientation"));
                    WebView web = activity.getBridge().getWebView();
                    web.evaluateJavascript("JSON.stringify({title:document.title,ready:!!document.querySelector('.shell'),count:document.querySelector('.nav-count')?.textContent,offline:document.querySelector('#offline-state')?.textContent,map:!!document.querySelector('[data-action=\"nav\"][data-view=\"sky\"]')})",value -> {result.set(value);latch.countDown();});
                });
                assertTrue(latch.await(5,TimeUnit.SECONDS));
                if(result.get().contains("\\\"ready\\\":true"))break;
                Thread.sleep(200);
            }
            assertTrue("Atlas did not render: "+result.get(),result.get().contains("\\\"ready\\\":true"));
            assertTrue(result.get(),result.get().contains("306"));
            assertTrue(result.get(),result.get().contains("\\\"map\\\":true"));
            assertTrue(result.get(),result.get().contains("офлайн"));
        }
    }
    static class TestCall extends com.getcapacitor.PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        com.getcapacitor.JSObject result;
        String error;
        TestCall(com.getcapacitor.JSObject data) { super(null,"SkyOrientation","integration","test",data); }
        @Override public void resolve(com.getcapacitor.JSObject value) { result=value;done.countDown(); }
        @Override public void resolve() { done.countDown(); }
        @Override public void reject(String message,String code,Exception exception,com.getcapacitor.JSObject value) { error=message;done.countDown(); }
    }
    @Test public void nativeSensorApiStartsStopsAndRejectsInvalidCoordinates() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            TestCall available=new TestCall(new com.getcapacitor.JSObject());
            scenario.onActivity(a->((SkyOrientationPlugin)a.getBridge().getPlugin("SkyOrientation").getInstance()).available(available));
            assertTrue(available.done.await(5,TimeUnit.SECONDS));
            assertTrue(available.result.getBoolean("available"));
            TestCall invalid=new TestCall(new com.getcapacitor.JSObject().put("latitude",91).put("longitude",37.6));
            scenario.onActivity(a->((SkyOrientationPlugin)a.getBridge().getPlugin("SkyOrientation").getInstance()).start(invalid));
            assertTrue(invalid.done.await(5,TimeUnit.SECONDS));assertNotNull(invalid.error);
            TestCall start=new TestCall(new com.getcapacitor.JSObject().put("latitude",56.0).put("longitude",37.6));
            scenario.onActivity(a->((SkyOrientationPlugin)a.getBridge().getPlugin("SkyOrientation").getInstance()).start(start));
            assertTrue(start.done.await(5,TimeUnit.SECONDS));assertNull(start.error);assertNotNull(start.result);assertTrue(start.result.has("declination"));
            TestCall stop=new TestCall(new com.getcapacitor.JSObject());
            scenario.onActivity(a->((SkyOrientationPlugin)a.getBridge().getPlugin("SkyOrientation").getInstance()).stop(stop));
            assertTrue(stop.done.await(5,TimeUnit.SECONDS));assertNull(stop.error);
        }
    }

    public static class SensorResultBridge {
        final CountDownLatch done = new CountDownLatch(1);
        volatile String result;
        @android.webkit.JavascriptInterface public void result(String json) { result=json;done.countDown(); }
    }
    @Test public void orientationEventsReachTheWebAppThroughCapacitor() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            SensorResultBridge result=new SensorResultBridge();
            // Android exposes a newly added JavaScript interface only after the next page load.
            scenario.onActivity(a->{WebView web=a.getBridge().getWebView();web.addJavascriptInterface(result,"DeepSkySensorTest");web.reload();});
            // Exercise the public native plugin API, without simulating UI input.
            String script="(async()=>{try{const version=new URL(document.querySelector('script[type=module]').src).search;const m=await import(new URL('/vendor/native-bridge.mjs'+version,location.href).href);const a=await m.SkyOrientation.available();if(!a.available)throw Error('sensor unavailable');let completed=false;let listener=await m.SkyOrientation.addListener('orientation',async sample=>{if(completed)return;completed=true;DeepSkySensorTest.result(JSON.stringify(sample));await m.SkyOrientation.stop();await listener.remove();});await m.SkyOrientation.start({latitude:56,longitude:37.6});}catch(error){DeepSkySensorTest.result(JSON.stringify({error:String(error)}));}})();";
            for(int i=0;i<50;i++) {
                CountDownLatch ready=new CountDownLatch(1);AtomicReference<String> state=new AtomicReference<>("");
                scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript("!!document.querySelector('.shell')&&typeof DeepSkySensorTest!=='undefined'",v->{state.set(v);ready.countDown();}));
                assertTrue(ready.await(5,TimeUnit.SECONDS));if("true".equals(state.get()))break;Thread.sleep(200);
            }
            scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript(script,null));
            assertTrue("No orientation reached JavaScript",result.done.await(12,TimeUnit.SECONDS));
            org.json.JSONObject sample=new org.json.JSONObject(result.result);assertFalse(result.result,sample.has("error"));
            for(String key:new String[]{"forward","right","up"}){org.json.JSONArray vector=sample.getJSONArray(key);assertEquals(3,vector.length());for(int i=0;i<3;i++)assertTrue(Double.isFinite(vector.getDouble(i)));}
            assertTrue(sample.has("accuracy"));assertTrue(sample.has("declination"));
        }
    }

}
