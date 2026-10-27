package ar.net.javierlust.opendefensefortress;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Contenedor nativo mínimo.
 *
 * No usa plugins JS: el juego sigue siendo zero-dep. El lifecycle se resuelve
 * acá y se comunica al WebView con eventos DOM:
 *   - gdf:native-pause  -> main.js pausa la partida y el audio
 *   - gdf:native-resume -> main.js reanuda el AudioContext
 *
 * El botón atrás llama a window.__gdfBack(); si el juego no lo maneja, la app
 * pasa a background en vez de cerrarse.
 */
public class MainActivity extends BridgeActivity {

    private static final String EVENT_PAUSE = "gdf:native-pause";
    private static final String EVENT_RESUME = "gdf:native-resume";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        keepScreenOn(true);
    }

    private void keepScreenOn(boolean on) {
        if (on) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    private WebView webView() {
        return getBridge() != null ? getBridge().getWebView() : null;
    }

    private void dispatch(String event) {
        WebView view = webView();
        if (view == null) return;
        String js = "window.dispatchEvent(new Event('" + event + "'))";
        view.evaluateJavascript(js, null);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebView view = webView();
        if (view == null) {
            moveTaskToBack(true);
            return;
        }
        view.evaluateJavascript(
            "window.__gdfBack ? window.__gdfBack() : false",
            value -> {
                if (!"true".equals(value)) {
                    runOnUiThread(() -> moveTaskToBack(true));
                }
            }
        );
    }

    @Override
    public void onPause() {
        dispatch(EVENT_PAUSE);
        keepScreenOn(false);
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        keepScreenOn(true);
        dispatch(EVENT_RESUME);
    }
}
