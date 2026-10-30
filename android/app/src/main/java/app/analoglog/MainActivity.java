// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
package app.analoglog;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins register before the bridge starts.
        registerPlugin(RestTimerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
