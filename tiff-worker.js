/**
 * Web Worker para decodificar ficheros TIFF en un hilo separado.
 * Usa UTIF.js + OffscreenCanvas para no bloquear la interfaz.
 */
import * as UTIF from 'utif';

self.onmessage = async function (e) {
    const { name, buffer } = e.data;

    try {
        const ifds = UTIF.decode(buffer);
        UTIF.decodeImage(buffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);
        const w = ifds[0].width, h = ifds[0].height;

        // Scale down for preview
        const MAX = 2000;
        let scale = 1;
        if (w > MAX || h > MAX) scale = MAX / Math.max(w, h);
        const fw = Math.round(w * scale), fh = Math.round(h * scale);

        // Full-size canvas
        const src = new OffscreenCanvas(w, h);
        const srcCtx = src.getContext('2d');
        srcCtx.putImageData(
            new ImageData(new Uint8ClampedArray(rgba.buffer), w, h),
            0, 0
        );

        // Scaled preview canvas
        const dst = new OffscreenCanvas(fw, fh);
        const dstCtx = dst.getContext('2d');
        dstCtx.drawImage(src, 0, 0, fw, fh);

        const blob = await dst.convertToBlob({ type: 'image/jpeg', quality: 0.85 });

        self.postMessage({ name, blob, w, h, ok: true });
    } catch (err) {
        self.postMessage({ name, ok: false, error: err.message });
    }
};
