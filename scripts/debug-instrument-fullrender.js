// Debug instrumentation: logs every fullRender call to the console
// with a stack trace. Injected via --debug-inject at app launch.
(() => {
    function instrument() {
        const editor = /** @type {any} */ (window).__editor;
        if (!editor) {
            setTimeout(instrument, 100);
            return;
        }
        const orig = editor.fullRender.bind(editor);
        let count = 0;
        editor.fullRender = (/** @type {any[]} */ ...args) => {
            count++;
            const stack = (new Error().stack ?? '').split('\n').slice(1, 6).join('\n');
            console.log(`[fullRender #${count}] called\n${stack}`);
            return orig(...args);
        };
        console.log('[debug-inject] fullRender instrumented — watching for calls');
    }
    instrument();
})();
