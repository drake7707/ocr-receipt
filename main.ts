interface BufferMap<T> {
    [key: string]: T;
}

/**
 *  Class that keeps track of image buffers
 *  By reusing previously used buffers the garbage collection is almost completely removed
 *  which removes any spikes during processing
 */
class BufferManager {

    private floatBuffers: BufferMap<Float32Array[]> = {};

    private uint8Buffers: BufferMap<Uint8Array[]> = {};

    getFloatBuffer(length: number): Float32Array {
        let availableBuffers = this.floatBuffers[length];
        if (typeof availableBuffers === "undefined") {
            availableBuffers = [];
            this.floatBuffers[length] = availableBuffers;
        }

        if (availableBuffers.length > 0) {
            return availableBuffers.pop();
        }
        else {
            console.log("Creating new float32 buffer" + new Error().stack);
            return new Float32Array(length);
        }
    }

    releaseFloatBuffer(buffer: Float32Array) {
        this.floatBuffers[buffer.length].push(buffer);
        // console.log("Releasing buffer of length " + buffer.length + ", there are " + this.floatBuffers[buffer.length].length + " buffers available");
    }

    getUInt8Buffer(length: number): Uint8Array {
        // console.log("Getting buffer of length " + length);
        let availableBuffers = this.uint8Buffers[length];
        if (typeof availableBuffers === "undefined") {
            availableBuffers = [];
            this.uint8Buffers[length] = availableBuffers;
        }

        if (availableBuffers.length > 0) {
            // console.log("Reusing buffer");
            return availableBuffers.pop();
        }
        else {
            console.log("Creating new Uint8 buffer" + new Error().stack);
            return new Uint8Array(length);
        }
    }

    releaseUInt8Buffer(buffer: Uint8Array) {
        this.uint8Buffers[buffer.length].push(buffer);
        //        console.log("Releasing buffer of length " + buffer.length + ", there are " + this.uint8Buffers[buffer.length].length + " buffers available");
    }

    private static instance: BufferManager = null;
    static getInstance(): BufferManager {
        if (BufferManager.instance == null)
            BufferManager.instance = new BufferManager();
        return BufferManager.instance;
    }
}


class GUI {
    private static isWorkingOnOCR = false;
    private static isPaused = false;
    private static debug = false;

    private static smallCanvas: HTMLCanvasElement;
    private static fullCanvas: HTMLCanvasElement;

    private static lastExtractResult: Algorithm.ExtractResult = null;
    // make a copy of the full image to run OCR on with the last extract result
    private static lastFullCanvasImage: HTMLCanvasElement;

    static extractSettings: Algorithm.ExtractSettings = {
        contourSearchingWidth: 320,
        enhanceContrastFactor: 1.5,
        cannyThresholdSigmaMultiplier: 1,
        borderPadding: 5,

        // the area of the contour / the area of the hull of the contour. The better the contour approximates 
        // a convex polygon the higher the ratio. A rectangle is convex so it should be pretty high
        contourAreaToHullAreaMinimumRatio: 0.7,
        // the minimum area the contour should be, percentage wise on the image (1/8*w * 1/8*h ==> 1/64)
        contourMininumAreaPercentage: 1 / 64,
        // to have a valid contour the start and end should be close together as a rectangle is closed
        // this is the percentage of the max(width,height) that is allowed as distance between the start and end
        // lower is more strict but could remove desired contours
        contourStartAndEndPointsMaximumDistancePercentage: 0.1,

        // the minimum angle there has to be between consecutive points of the contour
        // this disqualifies any contours with very sharp jaggy edges
        contourPointsMinimumAngleBetweenPoints: 80,

        removeCannyClustersSmallerThan: 5,
        removeCannyEdgesCloseToDiagonal: false,
    };

    static warpSettings: Algorithm.WarpSettings = {
        nickThresholdWindowSize: 19,
        nickThresholdK: -0.1
    }

    static main() {

        // create the smaller and full canvases only once
        GUI.smallCanvas = document.createElement("canvas");
        GUI.fullCanvas = document.createElement("canvas");
        GUI.lastFullCanvasImage = document.createElement("canvas");

        let video = <HTMLVideoElement>document.querySelector("#videoElement");
        navigator.getUserMedia = navigator.getUserMedia || (<any>navigator).webkitGetUserMedia || (<any>navigator).mozGetUserMedia || (<any>navigator).msGetUserMedia || (<any>navigator).oGetUserMedia;

        if (navigator.getUserMedia) {
            let constraints: any = {
                video: { facingMode: { exact: "environment" }, width: { exact: 1920 }, height: { exact: 1080 } },
                audio: false
            };
            // get webcam feed if available
            navigator.getUserMedia(constraints, (stream: MediaStream) => GUI.handleVideo(video, stream), () => {

                // try without facing mode
                constraints = {
                    video: true,
                    audio: false
                };
                navigator.getUserMedia(constraints, (stream: MediaStream) => GUI.handleVideo(video, stream), err => {
                    alert("Unable to initialize video: " + JSON.stringify(err));
                });
            });
        }

        document.getElementById("toggleDebug").onclick = (ev) => {
            GUI.debug = !GUI.debug;
            document.getElementById("debugstuff").style.display = GUI.debug ? "block" : "none";
        };

        document.getElementById("videoContainer").onclick = (ev) => {
            GUI.isPaused = !GUI.isPaused;
        };

        document.getElementById("output").onclick = (ev) => {
            if (GUI.isWorkingOnOCR)
                return;

            if (GUI.lastExtractResult == null)
                return;

            GUI.isWorkingOnOCR = true;

            let targetCanvas = document.createElement("canvas");
            let warpResult = Algorithm.warpExtractedResultAndPrepareForOCR(GUI.lastFullCanvasImage, targetCanvas, GUI.lastExtractResult, GUI.warpSettings, GUI.debug);

            //document.body.appendChild(targetCanvas);
            let job = Tesseract.recognize(targetCanvas, {
                lang: 'eng',
            }).progress(message => {
                try {
                    (<HTMLProgressElement>document.getElementById("barOCR")).value = message.progress;
                }
                catch (e) {

                }
            }).catch(err => console.error(err))
                .then(result => document.getElementById("txtOutput").textContent = result.text)
                .finally(resultOrError => {
                    GUI.isWorkingOnOCR = false;
                });

        }
    }

    private static handleVideo(video: HTMLVideoElement, stream: MediaStream) {
        // if found attach feed to video element
        video.srcObject = stream;

        window.setInterval(() => {
            if (GUI.isWorkingOnOCR || GUI.isPaused)
                return;

            if (video.videoWidth != 0 && video.videoHeight != 0) {
                // have the video overlay match the video input
                (<any>document.getElementById("videoContainer")).style.height = video.videoHeight;
                (<any>document.getElementById("videoContainer")).style.width = video.videoWidth;
                if ((<HTMLCanvasElement>document.getElementById("videoOverlay")).width != video.videoWidth)
                    (<HTMLCanvasElement>document.getElementById("videoOverlay")).width = video.videoWidth;
                if ((<HTMLCanvasElement>document.getElementById("videoOverlay")).height != video.videoHeight)
                    (<HTMLCanvasElement>document.getElementById("videoOverlay")).height = video.videoHeight;

                // draw the video to the canvases
                GUI.updateCanvases(video, GUI.extractSettings);

                let targetCanvas = <HTMLCanvasElement>document.getElementById("output");
                let extractResult = Algorithm.extractBiggestRectangularArea(GUI.extractSettings, GUI.smallCanvas, GUI.debug);
                if (extractResult.success) {

                    // keep the result so it can be applied for OCR later
                    GUI.lastExtractResult = extractResult;

                    if (GUI.lastFullCanvasImage.width != GUI.fullCanvas.width ||
                        GUI.lastFullCanvasImage.height != GUI.fullCanvas.height) {
                        GUI.lastFullCanvasImage.width = GUI.fullCanvas.width;
                        GUI.lastFullCanvasImage.height = GUI.fullCanvas.height;
                    }
                    GUI.lastFullCanvasImage.getContext("2d").drawImage(GUI.fullCanvas, 0, 0, GUI.fullCanvas.width, GUI.fullCanvas.height);

                    GUI.drawExtractedResultOnOverlay(extractResult);

                    let warpResult: Algorithm.WarpAndPrepareResult;
                    if ((<HTMLInputElement>document.getElementById("chkHighRes")).checked) {
                        warpResult = Algorithm.warpExtractedResultAndPrepareForOCR(GUI.fullCanvas, targetCanvas, extractResult, GUI.warpSettings, GUI.debug);
                    }
                    else {
                        // warp the smaller canvas to the output. When the OCR process is started the cached lastFullCanvasImage will be used
                        // to warp & threshold for better quality
                        warpResult = Algorithm.warpExtractedResultAndPrepareForOCR(GUI.smallCanvas, targetCanvas, extractResult, GUI.warpSettings, GUI.debug);
                    }

                    document.getElementById("txt").innerHTML = extractResult.timing.concat(warpResult.timing).join("<br/>");
                }
                else
                    document.getElementById("txt").innerHTML = extractResult.timing.join("<br/>");
            }
        }, 10);
    }

    private static updateCanvases(video: HTMLVideoElement, settings: Algorithm.ExtractSettings) {
        let w = video.videoWidth;
        let h = video.videoHeight
        if (w > settings.contourSearchingWidth) {
            w = settings.contourSearchingWidth
            h = Math.floor(video.videoHeight / video.videoWidth * settings.contourSearchingWidth);
        }

        if (GUI.smallCanvas.width != w || GUI.smallCanvas.height != h) {
            GUI.smallCanvas.width = w;
            GUI.smallCanvas.height = h;
        }

        let ctx = GUI.smallCanvas.getContext("2d");
        ctx.drawImage(video, 0, 0, GUI.smallCanvas.width, GUI.smallCanvas.height);

        let multiplier = 1;
        if (GUI.fullCanvas.width != video.videoWidth * multiplier || GUI.fullCanvas.height != video.videoHeight * multiplier) {
            GUI.fullCanvas.width = video.videoWidth * multiplier;
            GUI.fullCanvas.height = video.videoHeight * multiplier;
        }
        let fullCtx = GUI.fullCanvas.getContext("2d");
        fullCtx.drawImage(video, 0, 0, GUI.fullCanvas.width, GUI.fullCanvas.height);
    }


    private static drawExtractedResultOnOverlay(extractResult: Algorithm.ExtractResult) {
        let overlay = (<HTMLCanvasElement>document.getElementById("videoOverlay"))
        let overlayCtx = overlay.getContext("2d");
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
        overlayCtx.strokeStyle = "red";
        overlayCtx.lineWidth = 2;
        overlayCtx.beginPath();
        overlayCtx.moveTo(extractResult.leftTop[0] * overlay.width, extractResult.leftTop[1] * overlay.height);
        overlayCtx.lineTo(extractResult.rightTop[0] * overlay.width, extractResult.rightTop[1] * overlay.height);
        overlayCtx.lineTo(extractResult.rightBottom[0] * overlay.width, extractResult.rightBottom[1] * overlay.height);
        overlayCtx.lineTo(extractResult.leftBottom[0] * overlay.width, extractResult.leftBottom[1] * overlay.height);
        overlayCtx.lineTo(extractResult.leftTop[0] * overlay.width, extractResult.leftTop[1] * overlay.height);
        overlayCtx.stroke();
    }


    static saveToCanvas(elementId: string, grayscale: Uint8Array, width: number, height: number) {
        let debugCanvas = <HTMLCanvasElement>document.getElementById(elementId);
        debugCanvas.width = width;
        debugCanvas.height = height;
        let ctx = debugCanvas.getContext("2d");

        let srcData = ctx.getImageData(0, 0, width, height);
        let dataIdx = 0;
        for (let idx: number = 0; idx < grayscale.length; idx++) {
            srcData.data[dataIdx] = grayscale[idx];
            srcData.data[dataIdx + 1] = grayscale[idx];
            srcData.data[dataIdx + 2] = grayscale[idx];
            srcData.data[dataIdx + 3] = 255;
            dataIdx += 4;
        }
        ctx.putImageData(srcData, 0, 0);
    }


    static drawHistogram(elementId: string, grayscale: Uint8Array, width: number, height: number) {
        let hist: number[] = new Array(256);
        for (let i: number = 0; i < 256; i++)
            hist[i] = 0;

        let max = Number.MIN_VALUE;
        for (let idx: number = 0; idx < grayscale.length; idx++) {
            hist[grayscale[idx]]++;
            if (max < hist[grayscale[idx]])
                max = hist[grayscale[idx]];
        }

        let histCanvas = <HTMLCanvasElement>document.getElementById(elementId);
        let ctx = histCanvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 256, 256);

        //ctx.translate(-0.5, -0.5);
        ctx.fillStyle = "black";
        for (let i: number = 0; i < 256; i++) {
            let h = hist[i] / max * 256;
            ctx.fillRect(i, 256 - h, 1, h);
        }
    }

}


namespace Algorithm {

    export interface ExtractSettings {
        contourSearchingWidth: number;
        enhanceContrastFactor: number;
        cannyThresholdSigmaMultiplier: number;
        borderPadding: number;

        contourAreaToHullAreaMinimumRatio: number;
        contourMininumAreaPercentage: number;
        contourStartAndEndPointsMaximumDistancePercentage: number;
        contourPointsMinimumAngleBetweenPoints: number;

        removeCannyClustersSmallerThan: number;
        removeCannyEdgesCloseToDiagonal: boolean;
    }

    export interface WarpSettings {

        nickThresholdWindowSize: number;
        nickThresholdK: number;
    }

    export class ExtractResult {
        public leftTop: number[] = null;
        public rightTop: number[] = null;
        public leftBottom: number[] = null;
        public rightBottom: number[] = null;
        public success: boolean = false;
        public timing: string[] = [];
    }

    export class WarpAndPrepareResult {
        public timing: string[] = [];
    }


    /**
     *  Searches for the biggest rectangular-like contour in the image and returns the 4 corners if found
     */
    export function extractBiggestRectangularArea(settings: ExtractSettings, canvas: HTMLCanvasElement, debug: boolean): ExtractResult {

        let ctx = canvas.getContext("2d");
        let w = canvas.width;
        let h = canvas.height;
        let srcData = ctx.getImageData(0, 0, w, h);

        let result: ExtractResult = new ExtractResult();

        //let grayscale = new Uint8Array(srcData.width *srcData.height);
        let grayscale = BufferManager.getInstance().getUInt8Buffer(srcData.width * srcData.height);

        result.timing.push(doTime("Grayscale", () => {
            let dataIdx = 0;
            for (let idx: number = 0; idx < grayscale.length; idx++) {
                grayscale[idx] = (srcData.data[dataIdx] + srcData.data[dataIdx + 1] + srcData.data[dataIdx + 2]) / 3;
                dataIdx += 4;
            }
        }, false));

        //stretchHistogram(grayscale, srcData.width, srcData.height);

        result.timing.push(doTime("Enhance contrast", () => {
            ImageOps.enhanceContrast(grayscale, settings.enhanceContrastFactor);
        }, false));

        let gaussian;
        result.timing.push(doTime("Gaussian blur", () => {
            /* grayscale = applyKernel3x3([
                 1 / 16, 1 / 8, 1 / 16,
                 1 / 8, 1 / 4, 1 / 8,
                 1 / 16, 1 / 8, 1 / 16], grayscale, srcData.width, srcData.height);
             grayscale = applyKernel3x3([
                 1 / 16, 1 / 8, 1 / 16,
                 1 / 8, 1 / 4, 1 / 8,
                 1 / 16, 1 / 8, 1 / 16], grayscale, srcData.width, srcData.height);
    */
            let gauss = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136];

            gaussian = ConvolutionOps.applySeparableKernel5x5(gauss, gauss, grayscale, srcData.width, srcData.height);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = gaussian;

            //    grayscale = applyKernel3x3([1/9, 1/9, 1/9, 1/9,1/9,1/9, 1/9, 1/9, 1/9], grayscale, srcData.width, srcData.height);
        }, false));

        let cannyLowerThreshold: number;
        let cannyHigherThreshold: number;
        result.timing.push(doTime("Median", () => {
            let med: number = ImageOps.median(grayscale);
            let sigma = settings.cannyThresholdSigmaMultiplier * 0.33;
            cannyLowerThreshold = Math.max(0, (1 - sigma) * med);
            cannyHigherThreshold = Math.min(255, (1 + sigma) * med);
        }, false));


        if (debug) {
            GUI.saveToCanvas("preCanny", grayscale, srcData.width, srcData.height);
            GUI.drawHistogram("histogram", grayscale, srcData.width, srcData.height);
        }

        result.timing.push(doTime("Canny", () => {
            let canny = Canny.applyCanny(settings.borderPadding, grayscale, srcData.width, srcData.height, cannyLowerThreshold, cannyHigherThreshold, settings.removeCannyClustersSmallerThan, settings.removeCannyEdgesCloseToDiagonal);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = canny;
        }, false));

        if (debug)
            GUI.saveToCanvas("postCanny", grayscale, srcData.width, srcData.height);

        result.timing.push(doTime("Remove border", () => {
            removeBorder(settings.borderPadding, grayscale, srcData.width, srcData.height);
        }, false));


        result.timing.push(doTime("Dilate & erode", () => {
            /*grayscale = dilate(grayscale, srcData.width, srcData.height);
            grayscale = dilate(grayscale, srcData.width, srcData.height);
            grayscale = dilate(grayscale, srcData.width, srcData.height);
            grayscale = dilate(grayscale, srcData.width, srcData.height);
           
            grayscale = erode(grayscale, srcData.width, srcData.height);
            grayscale = erode(grayscale, srcData.width, srcData.height);
            grayscale = erode(grayscale, srcData.width, srcData.height);
            grayscale = erode(grayscale, srcData.width, srcData.height);*/


            let dilated = MorphologicalOps.dilateFast(grayscale, srcData.width, srcData.height, 9, srcData.width, srcData.height);//MorphologicalOps.dilate4Fast(grayscale, srcData.width, srcData.height);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = dilated;

            let eroded = MorphologicalOps.erodeFast(grayscale, srcData.width, srcData.height, 9, srcData.width, srcData.height);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = eroded;

        }, false));

        if (debug)
            GUI.saveToCanvas("morph", grayscale, srcData.width, srcData.height);


        let allContours: number[][];
        result.timing.push(doTime("Trace contours", () => {

            // start from the center of the image and spiral around clockwise to find contour
            // starting points. That way the contours that are most relevant will be hit from the inside
            // and because it tracks the visited pixels and directions the outside of the contour that merges with the noise 
            // of the environment won't be considered
            allContours = ContourOps.traceContours(settings.borderPadding, grayscale, srcData.width, srcData.height);
        }, false));

        if (debug) {
            GUI.saveToCanvas("contourResult", grayscale, srcData.width, srcData.height);
        }

        // release the buffer, not needed anymore
        BufferManager.getInstance().releaseUInt8Buffer(grayscale);
        grayscale = null;

        let bestContour: number[] = null;
        let bestContourHull: number[] = null;
        let bestContourCorners: number[] = null;

        result.timing.push(doTime("Find best contour", () => {

            let width = srcData.width;
            let height = srcData.height;

            let result = findBestContour(allContours, width, height, settings);
            bestContour = result.contour;
            bestContourHull = result.hull;
            bestContourCorners = result.corners;

        }, false));


        if (debug) {
            let cIdx = 0;
            let colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];

            let contourResult = <HTMLCanvasElement>document.getElementById("contourResult");
            let ctx = contourResult.getContext("2d");
            for (let contour of allContours) {
                let c = colors[cIdx++ % colors.length];
                ctx.strokeStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]}`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                let x0 = contour[0] % srcData.width;
                let y0 = Math.floor(contour[0] / srcData.width);
                ctx.moveTo(x0, y0);

                let oldx = x0;
                let oldy = y0;
                for (let i: number = 1; i < contour.length; i++) {
                    let x = contour[i] % srcData.width;
                    let y = Math.floor(contour[i] / srcData.width);

                    oldx = x;
                    oldy = y;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        if (bestContour != null) {
            //console.warn(bestContour);

            if (debug) {
                let contourResult = <HTMLCanvasElement>document.getElementById("contourResult");
                let ctx = contourResult.getContext("2d");

                let cIdx = 0;
                let color = [255, 0, 0];
                ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]}`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                let x0 = bestContour[0] % srcData.width;
                let y0 = Math.floor(bestContour[0] / srcData.width);
                ctx.moveTo(x0, y0);

                let oldx = x0;
                let oldy = y0;
                for (let i: number = 1; i < bestContour.length; i++) {
                    let x = bestContour[i] % srcData.width;
                    let y = Math.floor(bestContour[i] / srcData.width);

                    oldx = x;
                    oldy = y;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();

                ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]}`;
                for (let i: number = 0; i < bestContourHull.length; i++) {
                    let x = bestContourHull[i] % srcData.width;
                    let y = Math.floor(bestContourHull[i] / srcData.width);

                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2, false);
                    ctx.fill();
                }

                // draw starting point
                ctx.fillStyle = "gray";
                ctx.beginPath();
                ctx.arc(x0, y0, 5, 0, Math.PI * 2, false);
                ctx.fill();

                // draw end point
                ctx.fillStyle = "#FFAA00";
                ctx.beginPath();
                ctx.arc(oldx, oldy, 3, 0, Math.PI * 2, false);
                ctx.fill();


                // draw the center of the polygon
                let center = ContourOps.centerOfPolygon(bestContour, srcData.width);
                let centerX = center % srcData.width;
                let centerY = Math.floor(center / srcData.width);

                ctx.fillStyle = "#55AA55";
                ctx.beginPath();
                ctx.arc(centerX, centerY, 5, 0, Math.PI * 2, false);
                ctx.fill();

                // draw the corners that were found
                for (let i: number = 0; i < bestContourCorners.length; i++) {
                    let x = bestContourCorners[i] % srcData.width;
                    let y = Math.floor(bestContourCorners[i] / srcData.width);

                    ctx.strokeStyle = "#55AA55";
                    ctx.beginPath();
                    ctx.lineWidth = 1;
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }

            }

            let center = ContourOps.centerOfPolygon(bestContour, srcData.width);
            let centerX = center % srcData.width;
            let centerY = Math.floor(center / srcData.width);


            // classify the 4 corners into the separate quadrants
            let leftTop: number[] = null;
            let rightTop: number[] = null;
            let leftBottom: number[] = null;
            let rightBottom: number[] = null;

            for (let i: number = 0; i < bestContourCorners.length; i++) {
                let x = bestContourCorners[i] % srcData.width;
                let y = Math.floor(bestContourCorners[i] / srcData.width);

                if (x <= centerX && y <= centerY)
                    leftTop = [x / srcData.width, y / srcData.height];
                else if (x > centerX && y <= centerY)
                    rightTop = [x / srcData.width, y / srcData.height];
                else if (x <= centerX && y > centerY)
                    leftBottom = [x / srcData.width, y / srcData.height];
                else
                    rightBottom = [x / srcData.width, y / srcData.height];
            }


            if (leftTop != null && rightTop != null && leftBottom != null && rightBottom != null) {
                result.leftTop = leftTop;
                result.leftBottom = leftBottom;
                result.rightTop = rightTop;
                result.rightBottom = rightBottom;
                result.success = true;
            }
        }
        return result;
    }


    /**
     *  Removes the border of the image, setting it to black
     */
    function removeBorder(padding: number, grayscale: Uint8Array, width: number, height: number): void {
        let idx = 0;
        for (let i: number = 0; i < padding * width; i++) {
            grayscale[idx] = 0;
            idx++;
        }
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = 0; x < padding; x++) {
                grayscale[idx] = 0;
                idx++;
            }
            idx += width - 2 * padding;
            for (let x: number = 0; x < padding; x++) {
                grayscale[idx] = 0;
                idx++;
            }
        }
        for (let i: number = 0; i < padding * width; i++) {
            grayscale[idx] = 0;
            idx++;
        }
    }


    /**
     *  Try to find the biggest area contour but constrained to the settings, such as not too close to the border of the image,
     *  have a minimum area, must be somewhat closed, must be close to convex, has to have 4 corners, etc.
     */
    function findBestContour(allContours: number[][], width: number, height: number, settings: ExtractSettings) {

        let bestContour: number[] = null;
        let bestContourHull: number[] = null;
        let bestContourCorners: number[] = null;

        let maxArea: number = Number.MIN_VALUE;
        for (let rawContour of allContours) {
            let hull = ContourOps.convexHull(rawContour, width);
            let area = Math.abs(ContourOps.polygonArea(rawContour, width));
            let hullarea = Math.abs(ContourOps.polygonArea(hull, width));

            let closeToBorderPointCount = 0;
            for (let i: number = 0; i < rawContour.length; i++) {
                let x = rawContour[i] % width;
                let y = Math.floor(rawContour[i] / width);
                if (x <= settings.borderPadding + 1 || x >= width - settings.borderPadding - 1 || y <= settings.borderPadding + 1 || y >= height - settings.borderPadding - 1)
                    closeToBorderPointCount++;
            }

            // todo put the close to border count in settings
            if (closeToBorderPointCount < 100) { // make sure that nothing encroaches the border because then the contour is a significant chunk of  full image, which is not what it usually is
                if (area / hullarea > settings.contourAreaToHullAreaMinimumRatio) {
                    if (Math.abs(area) > width * height * settings.contourMininumAreaPercentage) {
                        let x0 = rawContour[0] % width;
                        let y0 = Math.floor(rawContour[0] / width);
                        let xlast = rawContour[rawContour.length - 1] % width;
                        let ylast = Math.floor(rawContour[rawContour.length - 1] / width);
                        let dist = Math.abs(x0 - xlast) + Math.abs(y0 - ylast);
                        if (dist < settings.contourStartAndEndPointsMaximumDistancePercentage * Math.max(width, height)) {
                            // check if angles between prevP - curP and curP - nextP are > 60°
                            let angles = ContourOps.innerAnglesOfPolygon(hull, width);
                            // and all angles are always >= 80°
                            if (angles.filter(a => a < settings.contourPointsMinimumAngleBetweenPoints || a > 360 - settings.contourPointsMinimumAngleBetweenPoints).length == 0) {

                                let cornerPoints: number[] = ContourOps.findCorners(rawContour, width);
                                if (cornerPoints.length == 4) { // 4 corners spaced far enough in angle from the center
                                    if (area > maxArea) {
                                        bestContour = rawContour;
                                        bestContourHull = hull;
                                        bestContourCorners = cornerPoints;
                                        maxArea = area;
                                    }
                                }

                            }
                        }
                    }
                }
            }
        }
        return { contour: bestContour, hull: bestContourHull, corners: bestContourCorners };
    }


    /**
     * Warps the image to fix the perspective based on the found corners and then applies NICK thresholding
     * to have better black/white images for OCR
     */
    export function warpExtractedResultAndPrepareForOCR(canvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement, extractResult: ExtractResult, settings: WarpSettings, debug: boolean): WarpAndPrepareResult {
        let fullCtx = canvas.getContext("2d");
        let videoImageData = fullCtx.getImageData(0, 0, canvas.width, canvas.height);

        let grayscale = BufferManager.getInstance().getUInt8Buffer(videoImageData.width * videoImageData.height);

        let warpResult = new WarpAndPrepareResult();

        warpResult.timing.push(doTime("Full grayscale", () => {
            let dataIdx = 0;
            for (let idx: number = 0; idx < grayscale.length; idx++) {
                grayscale[idx] = (videoImageData.data[dataIdx] + videoImageData.data[dataIdx + 1] + videoImageData.data[dataIdx + 2]) / 3;
                dataIdx += 4;
            }
        }, false));

        let result: { width: number, height: number, data: Uint8Array };
        warpResult.timing.push(doTime("Warp perspective", () => {

            result = processPerspective(grayscale, videoImageData.width, videoImageData.height, extractResult.leftTop, extractResult.rightTop, extractResult.leftBottom, extractResult.rightBottom);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);

            //enhanceContrast(result.data, 2.5);
            if (debug)
                GUI.saveToCanvas("warpPerspectiveResult", result.data, result.width, result.height);
        }, false));

        let thresh: Uint8Array;
        warpResult.timing.push(doTime("NICK Binary Threshold", () => {
            thresh = result.data;
            ImageOps.binaryThresholdNICK(thresh, result.width, result.height, settings.nickThresholdWindowSize, settings.nickThresholdK, videoImageData.width, videoImageData.height);
        }, false));

        warpResult.timing.push(doTime("Erode", () => {
            let erode = MorphologicalOps.erode1Fast(thresh, result.width, result.height, videoImageData.width, videoImageData.height);
            BufferManager.getInstance().releaseUInt8Buffer(thresh);
            thresh = erode;
        }, false));


        // copy it to the target canvas
        targetCanvas.width = result.width;
        targetCanvas.height = result.height;

        let targetCtx = targetCanvas.getContext("2d");
        let targetData = targetCtx.createImageData(result.width, result.height);
        let targetArr = targetData.data;

        let idx = 0;
        for (let i: number = 0; i < thresh.length; i++) {
            targetArr[idx] = thresh[i];
            targetArr[idx + 1] = thresh[i];
            targetArr[idx + 2] = thresh[i];
            targetArr[idx + 3] = 255;
            idx += 4;
        }

        BufferManager.getInstance().releaseUInt8Buffer(thresh);

        targetCtx.putImageData(targetData, 0, 0);

        return warpResult;
    }

    /**
     *  Warps the perspective (similar to open cv's warp perspective)
     *  Each pixel in the target image gets looked up into the source image with the 
     *  PerspectiveOps.project(i,j), but this is refactored to reduce the nr of operations
     */
    function processPerspective(srcArray: Uint8Array, srcWidth: number, srcHeight: number, leftTopCorner: number[], rightTopCorner: number[], leftBottomCorner: number[], rightBottomCorner: number[]) {

        // length of left edge / length of top edge gives the ratio
        let v0x = leftBottomCorner[0] * srcWidth - leftTopCorner[0] * srcWidth;
        let v0y = leftBottomCorner[1] * srcHeight - leftTopCorner[1] * srcHeight;

        let v1x = rightTopCorner[0] * srcWidth - leftTopCorner[0] * srcWidth;
        let v1y = rightTopCorner[1] * srcHeight - leftTopCorner[1] * srcHeight;

        let leftEdgeLength = Math.sqrt(v0x * v0x + v0y * v0y);
        let topEdgeLength = Math.sqrt(v1x * v1x + v1y * v1y);

        // console.log("Top edge: " + topEdgeLength + " vs left " + leftEdgeLength);
        let ratio = leftEdgeLength / topEdgeLength;


        let targetHeight;
        let targetWidth;

        if (ratio < 1) {
            // width is much larger than the height
            targetWidth = srcWidth;
            targetHeight = srcWidth * ratio;
        }
        else {
            // height is much larger than the width
            targetWidth = srcHeight;
            targetHeight = srcHeight * ratio;
        }

        //console.log("target: " + targetWidth + "x" + targetHeight);
        if (targetWidth > srcWidth) {
            // resize to fit
            let resizeRatio = 1 / targetWidth * srcWidth;
            targetWidth = srcWidth;
            targetHeight = targetHeight * resizeRatio;



        }
        if (targetHeight > srcHeight) {
            let resizeRatio = 1 / targetHeight * srcHeight;
            targetWidth = targetWidth * resizeRatio;
            targetHeight = srcHeight;
        }

        targetWidth = Math.floor(targetWidth);
        targetHeight = Math.floor(targetHeight);

        // console.log("target: " + targetWidth + "x" + targetHeight);
        let transform = PerspectiveOps.general2DProjection(0, 0, leftTopCorner[0], leftTopCorner[1], // lt
            1, 0, rightTopCorner[0], rightTopCorner[1], // rt
            0, 1, leftBottomCorner[0], leftBottomCorner[1], // lb
            1, 1, rightBottomCorner[0], rightBottomCorner[1]);


        //let targetArray = new Uint8Array(targetWidth * targetHeight);
        // make the buffer larger than it's supposed to be
        // it's not necessary if it runs once, but keeping it the same size as the source
        // means the buffer can be reused later and as these are can be quite large which 
        // would save a lot in memory allocation
        let targetArray = BufferManager.getInstance().getUInt8Buffer(srcWidth * srcHeight);
        let targetIdx = 0;


        // transform per pixel on a full HD image is way too slow on phones
        // instead project every blockSize pixels and then linearly interpolate between the points

        let dx = 1 / targetWidth;
        let dy = 1 / targetHeight;

        let t0dx = transform[0] * dx;
        let t3dx = transform[3] * dx;
        let t6dx = transform[6] * dx;

        let t1dy = transform[1] * dy;
        let t4dy = transform[4] * dy;
        let t7dy = transform[7] * dy;

        let t1 = 0 + transform[2];
        let t4 = 0 + transform[5];
        let t7 = 0 + transform[8];
        for (let y: number = 0; y < targetHeight; y++) {


            //let pxPart = transform[1] * j + transform[2];
            //let pyPart = transform[4] * j + transform[5];
            //let pzPart = transform[7] * j + transform[8];
            let pxPart = t1;
            let pyPart = t4;
            let pzPart = t7;


            let t0 = 0;
            let t3 = 0;
            let t6 = 0;

            for (let x: number = 0; x < targetWidth; x++) {
                //let px = transform[0] * i + pxPart;
                //let py = transform[3] * i + pyPart;
                //let pz = transform[6] * i + pzPart;
                let px = t0 + pxPart;
                let py = t3 + pyPart;
                let pz = t6 + pzPart;

                let srcX = pz == 0 ? 0 : ~~(px / pz * srcWidth);

                if (srcX >= 0 && srcX < srcWidth) {

                    let srcY = pz == 0 ? 0 : ~~(py / pz * srcHeight);

                    if (srcY >= 0 && srcY < srcHeight) {
                        let idx = (srcY * srcWidth + srcX);
                        targetArray[targetIdx] = srcArray[idx];
                    }
                }
                targetIdx++;

                t0 += t0dx;
                t3 += t3dx;
                t6 += t6dx;
            }
            t1 += t1dy;
            t4 += t4dy;
            t7 += t7dy;
        }
        return {
            width: targetWidth,
            height: targetHeight,
            data: targetArray
        };
    }

}

namespace ContourOps {


    function angleBetween(prev: number, cur: number, next: number, width: number): number {

        let xprev = prev % width;
        let yprev = Math.floor(prev / width);

        let xcur = cur % width;
        let ycur = Math.floor(cur / width);

        let xnext = next % width;
        let ynext = Math.floor(next / width);

        let v1x = xprev - xcur;
        let v1y = yprev - ycur;

        let v2x = xnext - xcur;
        let v2y = ynext - ycur;

        let dot = v1x * v2x + v1y * v2y;
        let lenv1 = Math.sqrt(v1x * v1x + v1y * v1y);
        let lenv2 = Math.sqrt(v2x * v2x + v2y * v2y);

        let cos = dot / (lenv1 * lenv2);
        return Math.round(Math.acos(cos) / Math.PI * 180);
    }

    export function findCorners(contour: number[], width: number) {
        // find the 4 points that are furthest from the center and have at least 45° between them
        const minimumAngle = 45;

        let center = centerOfPolygon(contour, width);
        let centerX = center % width;
        let centerY = Math.floor(center / width);


        let bestPoints = [];
        let distancesSquared = new Array(contour.length);
        for (let i: number = 0; i < contour.length; i++) {
            let x = contour[i] % width;
            let y = Math.floor(contour[i] / width);
            distancesSquared[i] = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
        }

        let visited: boolean[] = new Array(contour.length);

        while (bestPoints.length < 4) {
            let maxDistance = Number.MIN_VALUE;
            let maxDistanceIndex = -1;
            for (let i: number = 0; i < contour.length; i++) {
                if (!visited[i]) {
                    if (maxDistance < distancesSquared[i]) {
                        maxDistance = distancesSquared[i];
                        maxDistanceIndex = i;
                    }
                }
            }
            if (maxDistanceIndex == -1)
                break;

            visited[maxDistanceIndex] = true;

            let canAdd = true;
            for (let i: number = 0; i < bestPoints.length && canAdd; i++) {
                let angle = angleBetween(bestPoints[i], center, contour[maxDistanceIndex], width);
                if (angle < minimumAngle || angle > 360 - minimumAngle)
                    canAdd = false;
            }

            if (canAdd && maxDistanceIndex != -1)
                bestPoints.push(contour[maxDistanceIndex]);
        }

        return bestPoints;
    }


    function spiralAround(sx: number, sy: number, width: number, height: number, func: (x: number, y: number) => void) {
        var l = sx;
        var r = sx + 1;
        var t = sy;
        var b = sy + 1;

        var radius = Math.max(width, height);
        var curX = l;
        var curY = t - 1;
        var curRadius = 0;

        while (curRadius < radius) {
            var edgeWidth = 1 + 2 * curRadius;
            if (curY >= 0 && curY < height) {
                for (var i: number = l; i <= r + edgeWidth; i++) {
                    if (curX < width && curX >= 0)
                        func(curX, curY);
                    curX++;
                }
            }
            else
                curX += r + edgeWidth + 1 - l;
            curX--;
            curY++;

            if (curX >= 0 && curX < width) {
                for (var i: number = t; i <= b + edgeWidth; i++) {
                    if (curY < height && curY >= 0)
                        func(curX, curY);
                    curY++;
                }
            }
            else
                curY += b + edgeWidth + 1 - t;

            curY--;
            curX--;

            if (curY >= 0 && curY < height) {
                for (var i: number = r; i >= l - edgeWidth; i--) {
                    if (curX >= 0 && curY < width)
                        func(curX, curY);
                    curX--;
                }
            }
            else {
                curX -= r + 1 - (l - edgeWidth);
            }

            curX++;
            curY--;

            if (curX >= 0 && curX < width) {
                for (var i: number = b; i >= t - edgeWidth; i--) {
                    if (curY >= 0 && curY < height)
                        func(curX, curY);
                    curY--;
                }
            }
            else {
                curY -= b + 1 - (t - edgeWidth);
            }

            curRadius++;
        }
    }


    // implementation of http://www.mdpi.com/1424-8220/16/3/353
    export function traceContours(padding: number, grayscale: Uint8Array, width: number, height: number) {
        let allContours: number[][] = [];

        enum Direction {
            Right,
            Bottom,
            Left,
            Top
        }
        enum Position {
            LeftFront,
            Front,
            RightFront,
            Right,
            RightRear,
            Rear,
            LeftRear,
            Left
        }

        // contour 
        let getX = function (pos: Position, dir: Direction) {
            switch (dir) {
                case Direction.Top:
                    switch (pos) {
                        case Position.Left:
                        case Position.LeftFront:
                        case Position.LeftRear:
                            return -1;
                        case Position.Right:
                        case Position.RightFront:
                        case Position.RightRear:
                            return 1;
                    }
                    break;
                case Direction.Right:
                    switch (pos) {
                        case Position.Front:
                        case Position.LeftFront:
                        case Position.RightFront:
                            return 1;
                        case Position.Rear:
                        case Position.LeftRear:
                        case Position.RightRear:
                            return -1;
                    }
                    break;
                case Direction.Bottom:
                    switch (pos) {
                        case Position.Right:
                        case Position.RightFront:
                        case Position.RightRear:
                            return -1;
                        case Position.Left:
                        case Position.LeftFront:
                        case Position.LeftRear:
                            return 1;
                    }
                    break;
                case Direction.Left:
                    switch (pos) {
                        case Position.LeftFront:
                        case Position.Front:
                        case Position.RightFront:
                            return -1;
                        case Position.LeftRear:
                        case Position.Rear:
                        case Position.RightRear:
                            return 1;
                    }
                    break;
            }
            return 0;
        };
        let getY = function (pos: Position, dir: Direction) {
            switch (dir) {
                case Direction.Top:
                    switch (pos) {
                        case Position.Front:
                        case Position.LeftFront:
                        case Position.RightFront:
                            return -1;
                        case Position.Rear:
                        case Position.LeftRear:
                        case Position.RightRear:
                            return 1;
                    }
                    break;
                case Direction.Right:
                    switch (pos) {
                        case Position.Right:
                        case Position.RightFront:
                        case Position.RightRear:
                            return 1;
                        case Position.Left:
                        case Position.LeftFront:
                        case Position.LeftRear:
                            return -1;
                    }
                    break;
                case Direction.Bottom:
                    switch (pos) {
                        case Position.Front:
                        case Position.LeftFront:
                        case Position.RightFront:
                            return 1;
                        case Position.Rear:
                        case Position.LeftRear:
                        case Position.RightRear:
                            return -1;
                    }
                    break;
                case Direction.Left:
                    switch (pos) {
                        case Position.Right:
                        case Position.RightFront:
                        case Position.RightRear:
                            return -1;
                        case Position.Left:
                        case Position.LeftFront:
                        case Position.LeftRear:
                            return 1;
                    }
                    break;
            }
            return 0;
        };

        let getDirection = function (pos: Position, dir: Direction): Direction {
            switch (dir) {
                case Direction.Top:
                    switch (pos) {
                        case Position.Front: return Direction.Top;
                        case Position.Left: return Direction.Left;
                        case Position.Right: return Direction.Right;
                        case Position.Rear: return Direction.Bottom;
                    }
                    break;
                case Direction.Right:
                    switch (pos) {
                        case Position.Front: return Direction.Right;
                        case Position.Left: return Direction.Top;
                        case Position.Right: return Direction.Bottom;
                        case Position.Rear: return Direction.Left;
                    }
                    break;
                case Direction.Bottom:
                    switch (pos) {
                        case Position.Front: return Direction.Bottom;
                        case Position.Left: return Direction.Right;
                        case Position.Right: return Direction.Left;
                        case Position.Rear: return Direction.Top;
                    }
                    break;
                case Direction.Left:
                    switch (pos) {
                        case Position.Front: return Direction.Left;
                        case Position.Left: return Direction.Bottom;
                        case Position.Right: return Direction.Top;
                        case Position.Rear: return Direction.Right;
                    }
                    break;
            }
            return 0;
        };

        let visited = new Uint8Array(width * height);



        let stop = false;

        //    for (let startY: number = rangeTop; startY < rangeBottom && !stop; startY++) {
        //        for (let startX: number = rangeLeft; startX < rangeRight && !stop; startX++) {
        spiralAround(Math.floor(width / 2), Math.floor(height / 2), width, height, (startX, startY) => {
            let dataIdx = startY * width + startX;

            // not visited, current position is on contour and rear is empty
            if (visited[dataIdx] == 0 && grayscale[dataIdx] >= 128 && (startX == 0 || grayscale[dataIdx - 1] < 128)) {
                // start point
                let startD: Direction = Direction.Right;
                let curX = startX;
                let curY = startY;
                let curD = startD;

                let it = 0;
                // console.log("Start of new contour at " + curX + "," + curY);
                let contour: number[] = [];

                //  let log: string[] = [];
                let curIdx = curY * width + curX;
                do {


                    if ((visited[curIdx] & (1 << curD)) > 0) {
                        //console.log("Already visited " + curX + ", " + curY + "in the direction " + curD + ", stopping");
                        break;
                    }

                    //if (!visited[curIdx] && grayscale[curIdx] >= 128)
                    if (grayscale[curIdx] >= 128)
                        contour.push(curIdx);
                    visited[curIdx] |= 1 << curD;
                    // log.push(curX + "," + curY + ", dir: " + curD);
                    let pLeftRearX = curX + getX(Position.LeftRear, curD);
                    let pLeftRearY = curY + getY(Position.LeftRear, curD);
                    let pLeftRearIdx = pLeftRearY * width + pLeftRearX;
                    // stage 1
                    if (grayscale[pLeftRearIdx] >= 128) {
                        let pLeftX = curX + getX(Position.Left, curD);
                        let pLeftY = curY + getY(Position.Left, curD);
                        let pLeftIdx = pLeftY * width + pLeftX;
                        if (grayscale[pLeftIdx] >= 128) {
                            // Case 1
                            //T(P, d) ← T(PLeft, dLeft) and Code(i) ← “Inner”
                            //T(P, d) ← T(PLeft, dLeft)
                            //log.push("case 1");
                            curX = pLeftX;
                            curY = pLeftY;
                            curD = getDirection(Position.Left, curD);
                            curIdx = pLeftIdx;

                            //if (!visited[curIdx] && grayscale[curIdx] >= 128)
                            if (grayscale[curIdx] >= 128)
                                contour.push(curIdx);
                            visited[curIdx] |= 1 << curD;
                            //log.push(curX + "," + curY + ", dir: " + curD);
                            pLeftX = curX + getX(Position.Left, curD);
                            pLeftY = curY + getY(Position.Left, curD);
                            pLeftIdx = pLeftY * width + pLeftX;

                            curX = pLeftX;
                            curY = pLeftY;
                            curD = getDirection(Position.Left, curD);
                            curIdx = pLeftIdx;
                        }
                        else {
                            // Case 2
                            //Code(i) ← “Inner − outer”
                            //T(P, d) ← T(PLeft−Rear, dRear) and Code(i) ← “Inner − outer”                            
                            //log.push("case 2");
                            curX = pLeftRearX;
                            curY = pLeftRearY;
                            curD = getDirection(Position.Rear, curD);
                            curIdx = pLeftRearIdx;
                        }
                    } else {
                        let pLeftX = curX + getX(Position.Left, curD);
                        let pLeftY = curY + getY(Position.Left, curD);
                        let pLeftIdx = pLeftY * width + pLeftX;
                        if (grayscale[pLeftIdx] >= 128) {
                            // Case 3
                            // T(P, d) ← T(PLeft, dLeft) and Code(i) ← “Straight”
                            //log.push("case 3");
                            curX = pLeftX;
                            curY = pLeftY;
                            curD = getDirection(Position.Left, curD);
                            curIdx = pLeftIdx;
                        }
                        else {
                            // Case 4
                            //Code(i) ← “Outer”   
                        }
                    }

                    //curIdx = curY * srcData.width + curX;
                    if (!visited[curIdx] && grayscale[curIdx] >= 128)
                        contour.push(curIdx);
                    visited[curIdx] |= 1 << curD;
                    //log.push(curX + "," + curY + ", dir: " + curD);
                    // stage 2
                    let pFrontLeftX = curX + getX(Position.LeftFront, curD);
                    let pFrontLeftY = curY + getY(Position.LeftFront, curD);
                    let pFrontLeftIdx = pFrontLeftY * width + pFrontLeftX;

                    let pFrontX = curX + getX(Position.Front, curD);
                    let pFrontY = curY + getY(Position.Front, curD);
                    let pFrontIdx = pFrontY * width + pFrontX;
                    if (grayscale[pFrontLeftIdx] >= 128) {

                        if (grayscale[pFrontIdx] >= 128) {
                            // Case 6
                            //T(P, d) ← T(PFront, dLeft) and Code(i) ← “Inner”
                            // log.push("case 6");
                            curX = pFrontX;
                            curY = pFrontY;
                            curD = getDirection(Position.Left, curD);
                            curIdx = pFrontIdx;

                            //if (!visited[curIdx] && grayscale[curIdx] >= 128)
                            if (grayscale[curIdx] >= 128)
                                contour.push(curIdx);
                            visited[curIdx] = 1 << curD;
                            //log.push(curX + "," + curY + ", dir: " + curD);
                            //T(P, d) ← T(PFront, dRight)
                            pFrontX = curX + getX(Position.Front, curD);
                            pFrontY = curY + getY(Position.Front, curD);
                            pFrontIdx = pFrontY * width + pFrontX;
                            curX = pFrontX;
                            curY = pFrontY;
                            curD = getDirection(Position.Right, curD);
                            curIdx = pFrontIdx;

                        }
                        else {
                            // Case 5
                            //Code(i) ← “Inner − outer”
                            //T(P, d) ← T(PFront−Left, d) and Code(i) ← “Inner − outer”
                            //log.push("case 5");
                            curX = pFrontLeftX;
                            curY = pFrontLeftY;
                            curIdx = pFrontLeftIdx;
                        }
                    }
                    else if (grayscale[pFrontIdx] >= 128) {
                        // Case 7
                        //T(P, d) ← T(PFront, dRight)
                        //log.push("case 7");
                        curX = pFrontX;
                        curY = pFrontY;
                        curD = getDirection(Position.Right, curD);
                        curIdx = pFrontIdx;
                    }
                    else {
                        // Case 8
                        //T(P, d) ← T(P, dRear) and i ← i − 1 and Code(i) ← “Outer”
                        //log.push("case 8");
                        curD = getDirection(Position.Rear, curD);
                    }


                    if (it++ > 10000) {
                        //     log = log.slice(log.length - 1000)
                        //    console.log(log);
                        console.warn("Too many iterations!")
                        stop = true;
                        break;
                    }

                } while (curX != startX || curY != startY || curD != startD);

                if (contour.length > 1)
                    allContours.push(contour);
            }

        });
        //          }
        //      }

        return allContours;
    }



    export function centerOfPolygon(contour: number[], width: number) {
        let sumX = 0;
        let sumY = 0;

        for (let i: number = 0; i < contour.length; i++) {

            sumX += contour[i] % width;
            sumY += Math.floor(contour[i] / width);
        }
        let centerX = Math.floor(sumX / contour.length);
        let centerY = Math.floor(sumY / contour.length);
        return centerY * width + centerX;
    }



    /**
     * @param points An array of [X, Y] coordinates
     *  from: https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain
     */
    export function convexHull(contour: number[], width: number) {

        let points = new Array(contour.length);
        let idx = 0;
        for (let i = 0; i < contour.length; i++) {
            let x = contour[i] % width;
            let y = Math.floor(contour[i] / width);
            points[idx] = [x, y];
            idx++;
        }

        function cross(a: number[], b: number[], o: number[]) {
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        }


        points.sort(function (a, b) {
            return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
        });

        var lower = [];
        for (let i = 0; i < points.length; i++) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
                lower.pop();
            }
            lower.push(points[i]);
        }

        var upper = [];
        for (let i = points.length - 1; i >= 0; i--) {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
                upper.pop();
            }
            upper.push(points[i]);
        }

        upper.pop();
        lower.pop();
        return lower.concat(upper).map(v => v[1] * width + v[0]);
    }

    export function innerAnglesOfPolygon(contour: number[], width: number) {

        let angles: number[] = [];
        if (contour.length > 3) {


            for (let i: number = 0; i < contour.length; i++) {
                let prevIdx = i - 1;
                if (prevIdx < 0) prevIdx = contour.length - 1;
                let nextIdx = i + 1;
                if (nextIdx >= contour.length) nextIdx = 0;

                let xprev = contour[prevIdx] % width;
                let yprev = Math.floor(contour[prevIdx] / width);

                let xcur = contour[i] % width;
                let ycur = Math.floor(contour[i] / width);

                let xnext = contour[nextIdx] % width;
                let ynext = Math.floor(contour[nextIdx] / width);

                let v1x = xprev - xcur;
                let v1y = yprev - ycur;

                let v2x = xnext - xcur;
                let v2y = ynext - ycur;

                let dot = v1x * v2x + v1y * v2y;
                let lenv1 = Math.sqrt(v1x * v1x + v1y * v1y);
                let lenv2 = Math.sqrt(v2x * v2x + v2y * v2y);

                let cos = dot / (lenv1 * lenv2);
                angles.push(Math.round(Math.acos(cos) / Math.PI * 180));
                // cos ang = dot / len(v1) * len(v2)
            }
        }
        return angles;
    }

    /**
     * Calculates the area of the polygon
     * from: https://stackoverflow.com/questions/16285134/calculating-polygon-area
     */
    export function polygonArea(contour: number[], width: number) {
        let area = 0;  // Accumulates area in the loop   
        let j = contour.length - 1;  // The last vertex is the 'previous' one to the first

        for (let i = 0; i < contour.length; i++) {
            let xi = contour[i] % width;
            let yi = Math.floor(contour[i] / width);

            let xj = contour[j] % width;
            let yj = Math.floor(contour[j] / width);

            area = area + (xj + xi) * (yj - yi);
            j = i;  //j is previous vertex to i
        }
        return area / 2;
    }

}

namespace ImageOps {


    export function median(grayscale: Uint8Array) {
        let buckets: number[] = new Array(256);
        for (let i: number = 0; i < grayscale.length; i++)
            buckets[grayscale[i]] = 0;

        for (let i: number = 0; i < grayscale.length; i++)
            buckets[grayscale[i]]++;


        let median: number = -1;

        let halfPoint = grayscale.length / 2;
        let count = 0;

        for (let i: number = 0; i < buckets.length; i++) {
            count += buckets[i];

            if (count >= halfPoint) { // median falls inside the current bucket
                median = i;
                break;
            }
        }

        //let sorted = grayscale.slice(0).sort((a, b) => (b > a) ? 1 : (b < a) ? -1 : 0);
        //let medianBySorted = sorted[Math.floor(sorted.length / 2)];
        return median;
    }



    export function binaryThresholdNICK(grayscale: Uint8Array, width: number, height: number, wndSize: number, k: number, bufferWidth: number, bufferHeight: number) {
        // keep track of the sum and squared sum of the sliding window
        // this implementation is using a separable kernel so it's divided into 
        // an x-pass which just sums up the row in the window followed by an y-pass
        // which takes these partial sums and sums them in the y direction
        //let piSumXPass: Float32Array = new Float32Array(width * height);
        //let piSquaredSumXPass: Float32Array = new Float32Array(width * height);

        // the bufferWidth & bufferHeight is > width & height, but needs to be the same across calls
        // to reuse the same buffer
        let piSumXPass: Float32Array = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        let piSquaredSumXPass: Float32Array = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        piSumXPass.fill(0);
        piSquaredSumXPass.fill(0);

        let halfWndSize = Math.floor(wndSize / 2);

        // doing x-pass and then y-pass is different if the values around the border
        // are taken in account, because x-pass is only done with padding and yet y-pass
        // would take the 0 values from x-pass, compared doing it in 1 go would use the values
        // of the border directly, so removing the border ensures the values are the same as the
        // original slow method without separating the kernels. I don't really care so much about the borders
        // so /ignore
        //removeBorder(halfWndSize, grayscale, width, height);

        let NP = wndSize * wndSize;

        // keep track of index based on padding
        let padding = halfWndSize;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {

            // instead of calculating the sum of the entire row within the window
            // it can be done more efficiently by only calculating the sum for the first 
            // window and then with each shift of the window to the right subtract the element
            // that falls out of the window and add the element that now falls inside the window
            // for large kernels this means only k + 2 * width operations instead of k * width ops
            let sum = 0;
            let sumSquared = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let val = grayscale[idx + wnd];
                sum += val
                sumSquared += val * val;
            }
            piSumXPass[idx] = sum;
            piSquaredSumXPass[idx] = sumSquared;

            idx++;

            for (let x: number = padding + 1; x < width - padding; x++) {

                let remVal = grayscale[idx - 1 - halfWndSize];
                let addVal = grayscale[idx + halfWndSize];
                // remove the element that falls out of the range
                sum -= remVal;
                // and add the element that enters the range
                sum += addVal;

                // remove the element that falls out of the range
                sumSquared -= remVal * remVal;
                // and add the element that enters the range
                sumSquared += addVal * addVal;

                piSumXPass[idx] = sum;
                piSquaredSumXPass[idx] = sumSquared;
                idx++;
            }
            idx += 2 * padding;
        }

        // now do the y-pass & immediately use the result at pixel (x,y) to determine
        // the threshold. It follows the same scheme as the x-pass but differs in index
        // calculation because it's vertical

        for (let x: number = padding; x < width - padding; x++) {
            idx = x + padding * width;

            let sum = 0;
            let sumSquared = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let cidx = idx + wnd * width;

                sum += piSumXPass[cidx];
                sumSquared += piSquaredSumXPass[cidx]
            }

            // calculate and apply the threshold at pixel
            {
                let m = sum / NP;
                let A = (sumSquared - (m * m)) / NP;
                let T = m + k * Math.sqrt(A);
                if (grayscale[idx] >= T)
                    grayscale[idx] = 255;
            }

            idx += width;

            let wEdge = halfWndSize * width;
            for (let y: number = padding + 1; y < height - padding; y++) {

                let cidx = idx - width - wEdge;
                sum -= piSumXPass[cidx];
                sumSquared -= piSquaredSumXPass[cidx];

                cidx = idx + wEdge;
                sum += piSumXPass[cidx];
                sumSquared += piSquaredSumXPass[cidx];

                // now calculate and apply the threshold at each pixel
                {
                    let m = sum / NP;
                    let A = (sumSquared - (m * m)) / NP;
                    let T = m + k * Math.sqrt(A);
                    if (grayscale[idx] >= T)
                        grayscale[idx] = 255;
                }

                idx += width;
            }
        }

        BufferManager.getInstance().releaseFloatBuffer(piSumXPass);
        BufferManager.getInstance().releaseFloatBuffer(piSquaredSumXPass);
    }

    export function binaryThresholdNICKCPUCacheOptimized(grayscale: Uint8Array, width: number, height: number, wndSize: number, k: number, bufferWidth: number, bufferHeight: number) {
        // keep track of the sum and squared sum of the sliding window
        // this implementation is using a separable kernel so it's divided into 
        // an x-pass which just sums up the row in the window followed by an y-pass
        // which takes these partial sums and sums them in the y direction
        //let piSumXPass: Float32Array = new Float32Array(width * height);
        //let piSquaredSumXPass: Float32Array = new Float32Array(width * height);

        // the bufferWidth & bufferHeight is > width & height, but needs to be the same across calls
        // to reuse the same buffer
        let piSumXPass: Float32Array = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        let piSquaredSumXPass: Float32Array = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        piSumXPass.fill(0);
        piSquaredSumXPass.fill(0);

        let halfWndSize = Math.floor(wndSize / 2);

        // doing x-pass and then y-pass is different if the values around the border
        // are taken in account, because x-pass is only done with padding and yet y-pass
        // would take the 0 values from x-pass, compared doing it in 1 go would use the values
        // of the border directly, so removing the border ensures the values are the same as the
        // original slow method without separating the kernels. I don't really care so much about the borders
        // so /ignore
        //removeBorder(halfWndSize, grayscale, width, height);

        let NP = wndSize * wndSize;

        let transposedWidth = height;
        let transposedHeight = width;

        // keep track of index based on padding
        let padding = halfWndSize;

        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {

            // instead of calculating the sum of the entire row within the window
            // it can be done more efficiently by only calculating the sum for the first 
            // window and then with each shift of the window to the right subtract the element
            // that falls out of the window and add the element that now falls inside the window
            // for large kernels this means only k + 2 * width operations instead of k * width ops
            let sum = 0;
            let sumSquared = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let val = grayscale[idx + wnd];
                sum += val
                sumSquared += val * val;
            }

            let transposeIdx = padding * transposedWidth + y;

            //   console.log("Saving " + padding + "," + y + " (" + idx + ") to " + transposeIdx);
            piSumXPass[transposeIdx] = sum;
            piSquaredSumXPass[transposeIdx] = sumSquared;

            idx++;
            transposeIdx += transposedWidth;

            for (let x: number = padding + 1; x < width - padding; x++) {

                let remVal = grayscale[idx - 1 - halfWndSize];
                let addVal = grayscale[idx + halfWndSize];
                // remove the element that falls out of the range
                sum -= remVal;
                // and add the element that enters the range
                sum += addVal;

                // remove the element that falls out of the range
                sumSquared -= remVal * remVal;
                // and add the element that enters the range
                sumSquared += addVal * addVal;

                piSumXPass[transposeIdx] = sum;
                piSquaredSumXPass[transposeIdx] = sumSquared;
                idx++;
                transposeIdx += transposedWidth;
            }
            idx += 2 * padding;
        }

        // now do the y-pass & immediately use the result at pixel (x,y) to determine
        // the threshold. It follows the same scheme as the x-pass but differs in index
        // calculation because it's vertical

        let transposedIdx = padding * transposedWidth + padding;
        for (let transposedY: number = padding; transposedY < transposedHeight - padding; transposedY++) {

            let sum = 0;
            let sumSquared = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                sum += piSumXPass[transposedIdx + wnd];
                sumSquared += piSquaredSumXPass[transposedIdx + wnd];
            }

            let originalIdx = padding * width + transposedY;

            //  console.log("Using transposed " + padding + "," + transposedY + " (" + transposedIdx + ") to " + originalIdx);
            {
                let m = sum / NP;
                let A = (sumSquared - (m * m)) / NP;
                let T = m + k * Math.sqrt(A);
                //  thresholds[originalIdx] = T;
                if (grayscale[originalIdx] >= T)
                    grayscale[originalIdx] = 255;
            }

            transposedIdx++;
            originalIdx += width;

            for (let transposedX: number = padding + 1; transposedX < transposedWidth - padding; transposedX++) {

                let cidx = transposedIdx - 1 - halfWndSize;
                sum -= piSumXPass[cidx];
                sumSquared -= piSquaredSumXPass[cidx];

                cidx = transposedIdx + halfWndSize;
                sum += piSumXPass[cidx];
                sumSquared += piSquaredSumXPass[cidx];

                {
                    let m = sum / NP;
                    let A = (sumSquared - (m * m)) / NP;
                    let T = m + k * Math.sqrt(A);

                    // thresholds[originalIdx] = T;
                    if (grayscale[originalIdx] >= T)
                        grayscale[originalIdx] = 255;
                }

                transposedIdx++;
                originalIdx += width;
            }
            transposedIdx += 2 * padding;
        }

        BufferManager.getInstance().releaseFloatBuffer(piSumXPass);
        BufferManager.getInstance().releaseFloatBuffer(piSquaredSumXPass);
    }

    export function enhanceContrast(grayscale: Uint8Array, factor: number) {

        for (let idx: number = 0; idx < grayscale.length; idx++) {
            let l = grayscale[idx];

            let val = factor * (l - 128) + 128;
            if (val < 0) val = 0;
            if (val > 255) val = 255;
            grayscale[idx] = val;
        }
    }

    export function stretchHistogram(grayscale: Uint8Array, width: number, height: number): void {

        let max = Number.MIN_VALUE;
        let min = Number.MAX_VALUE;
        for (let i: number = 0; i < grayscale.length; i++) {
            if (max < grayscale[i]) max = grayscale[i];
            if (min > grayscale[i]) min = grayscale[i];
        }
        if (max - min > 0 && max - min < 255) {
            let range = (max - min);
            for (let i: number = 0; i < grayscale.length; i++) {
                grayscale[i] = (grayscale[i] - min) / range * 255;
            }
        }
    }

}

namespace MorphologicalOps {
    export function dilate4Fast(grayscale: Uint8Array, width: number, height: number) {
        // 4x dilate 3x3 = 2x dilate 5x5 = 1x dilate 7x7
        //let xpass: Uint8Array = new Uint8Array(width * height);
        let xpass: Uint8Array = BufferManager.getInstance().getUInt8Buffer(width * height);

        let padding = 3;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {

            let sum =
                grayscale[idx - 3 - 0] +
                grayscale[idx - 2 - 0] +
                grayscale[idx - 1 - 0] +
                grayscale[idx - 0 - 0] +
                grayscale[idx + 1 - 0] +
                grayscale[idx + 2 - 0] +
                grayscale[idx + 3 - 0];
            xpass[idx] = sum > 0 ? 255 : 0;

            idx++;

            for (let x: number = padding + 1; x < width - padding; x++) {
                // remove the element that falls out of the range
                sum -= grayscale[idx - 1 - 3 - 0];
                // and add the element that enters the range
                sum += grayscale[idx + 3 - 0];

                xpass[idx] = sum > 0 ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }

        let w3 = width + width + width;
        let w2 = width + width;


        //let dst2: Uint8Array = new Uint8Array(width * height);
        let dst2 = BufferManager.getInstance().getUInt8Buffer(width * height);

        idx = padding * width + padding;
        for (let x: number = padding; x < width - padding; x++) {
            idx = x + padding * width;

            let sum =
                xpass[idx - 0 - w3] +
                xpass[idx - 0 - w2] +
                xpass[idx - 0 - width] +
                xpass[idx - 0 - 0] +
                xpass[idx - 0 + width] +
                xpass[idx - 0 + w2] +
                xpass[idx - 0 + w3];
            dst2[idx] = sum > 0 ? 255 : 0;

            idx += width;

            for (let y: number = padding + 1; y < height - padding; y++) {

                sum -= xpass[idx - width - 0 - w3];
                sum += xpass[idx - 0 + w3];

                dst2[idx] = sum > 0 ? 255 : 0;

                idx += width;
            }
        }

        BufferManager.getInstance().releaseUInt8Buffer(xpass);

        return dst2;
    }

    export function erode4Fast(grayscale: Uint8Array, width: number, height: number) {
        // 4x dilate 3x3 = 2x dilate 5x5 = 1x dilate 7x7
        //let xpass: Uint8ClampedArray = new Uint8ClampedArray(width * height);
        let xpass: Uint8Array = BufferManager.getInstance().getUInt8Buffer(width * height);

        let padding = 3;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {

            let sum =
                grayscale[idx - 3 - 0] +
                grayscale[idx - 2 - 0] +
                grayscale[idx - 1 - 0] +
                grayscale[idx - 0 - 0] +
                grayscale[idx + 1 - 0] +
                grayscale[idx + 2 - 0] +
                grayscale[idx + 3 - 0];
            xpass[idx] = sum == 7 * 255 ? 255 : 0;

            idx++;

            for (let x: number = padding + 1; x < width - padding; x++) {
                // remove the element that falls out of the range
                sum -= grayscale[idx - 1 - 3 - 0];
                // and add the element that enters the range
                sum += grayscale[idx + 3 - 0];

                xpass[idx] = sum == 7 * 255 ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }

        let w3 = width + width + width;
        let w2 = width + width;


        //let dst2: Uint8Array = new Uint8Array(width * height);
        let dst2 = BufferManager.getInstance().getUInt8Buffer(width * height);

        idx = padding * width + padding;
        for (let x: number = padding; x < width - padding; x++) {
            idx = x + padding * width;

            let sum =
                xpass[idx - 0 - w3] +
                xpass[idx - 0 - w2] +
                xpass[idx - 0 - width] +
                xpass[idx - 0 - 0] +
                xpass[idx - 0 + width] +
                xpass[idx - 0 + w2] +
                xpass[idx - 0 + w3];
            dst2[idx] = sum == 7 * 255 ? 255 : 0;

            idx += width;

            for (let y: number = padding + 1; y < height - padding; y++) {

                sum -= xpass[idx - width - 0 - w3];
                sum += xpass[idx - 0 + w3];

                dst2[idx] = sum == 7 * 255 ? 255 : 0;

                idx += width;
            }
        }

        BufferManager.getInstance().releaseUInt8Buffer(xpass);

        return dst2;
    }


    export function dilateFast(grayscale: Uint8Array, width: number, height: number, wndSize: number, bufferWidth: number, bufferHeight: number) {

        let xpass: Float32Array = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);


        let halfWndSize = Math.floor(wndSize / 2);

        //removeBorder(halfWndSize, grayscale, width, height);

        // keep track of index based on padding
        let padding = halfWndSize;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {


            let sum = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let val = grayscale[idx + wnd];
                sum += val

            }
            xpass[idx] = sum > 0 ? 255 : 0;

            idx++;

            for (let x: number = padding + 1; x < width - padding; x++) {

                let remVal = grayscale[idx - 1 - halfWndSize];
                let addVal = grayscale[idx + halfWndSize];
                // remove the element that falls out of the range
                sum -= remVal;
                // and add the element that enters the range
                sum += addVal;

                xpass[idx] = sum > 0 ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }

        // now do the y-pass & immediately use the result at pixel (x,y) to determine
        // the threshold. It follows the same scheme as the x-pass but differs in index
        // calculation because it's vertical

        let dst2 = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);

        for (let x: number = padding; x < width - padding; x++) {
            idx = x + padding * width;

            let sum = 0;
            let sumSquared = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let cidx = idx + wnd * width;

                sum += xpass[cidx];
            }

            dst2[idx] = sum > 0 ? 255 : 0;
            idx += width;

            let wEdge = halfWndSize * width;
            for (let y: number = padding + 1; y < height - padding; y++) {

                let cidx = idx - width - wEdge;
                sum -= xpass[cidx];


                cidx = idx + wEdge;
                sum += xpass[cidx];



                dst2[idx] = sum > 0 ? 255 : 0;
                idx += width;
            }
        }

        BufferManager.getInstance().releaseFloatBuffer(xpass);

        return dst2;
    }

    export function erodeFast(grayscale: Uint8Array, width: number, height: number, wndSize: number, bufferWidth: number, bufferHeight: number) {

        let xpass: Float32Array = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);

        let halfWndSize = Math.floor(wndSize / 2);

        // keep track of index based on padding
        let padding = halfWndSize;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {


            let sum = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let val = grayscale[idx + wnd];
                sum += val

            }
            xpass[idx] = sum == wndSize * 255 ? 255 : 0;

            idx++;

            for (let x: number = padding + 1; x < width - padding; x++) {

                let remVal = grayscale[idx - 1 - halfWndSize];
                let addVal = grayscale[idx + halfWndSize];
                // remove the element that falls out of the range
                sum -= remVal;
                // and add the element that enters the range
                sum += addVal;

                xpass[idx] = sum == wndSize * 255 ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }

        // now do the y-pass & immediately use the result at pixel (x,y) to determine
        // the threshold. It follows the same scheme as the x-pass but differs in index
        // calculation because it's vertical

        let dst2 = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);

        for (let x: number = padding; x < width - padding; x++) {
            idx = x + padding * width;

            let sum = 0;
            let sumSquared = 0;
            for (let wnd: number = -halfWndSize; wnd <= halfWndSize; wnd++) {
                let cidx = idx + wnd * width;

                sum += xpass[cidx];
            }

            dst2[idx] = sum == wndSize * 255 ? 255 : 0;
            idx += width;

            let wEdge = halfWndSize * width;
            for (let y: number = padding + 1; y < height - padding; y++) {

                let cidx = idx - width - wEdge;
                sum -= xpass[cidx];


                cidx = idx + wEdge;
                sum += xpass[cidx];

                dst2[idx] = sum == wndSize * 255 ? 255 : 0;
                idx += width;
            }
        }

        BufferManager.getInstance().releaseFloatBuffer(xpass);

        return dst2;
    }

    export function erode1Fast(grayscale: Uint8Array, width: number, height: number, bufferWidth: number, bufferHeight: number) {

        //let xpass: Uint8ClampedArray = new Uint8ClampedArray(width * height);
        let xpass: Uint8Array = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);

        let sumMustBe = 3 * 255;
        let padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {

            let sum =
                grayscale[idx - 1] +
                grayscale[idx] +
                grayscale[idx + 1];

            xpass[idx] = sum == sumMustBe ? 255 : 0;

            idx++;

            for (let x: number = padding + 1; x < width - padding; x++) {
                // remove the element that falls out of the range
                sum -= grayscale[idx - 1 - 1];
                // and add the element that enters the range
                sum += grayscale[idx + 1];

                xpass[idx] = sum == sumMustBe ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }

        let w3 = width + width + width;
        let w2 = width + width;


        //let dst2: Uint8Array = new Uint8Array(width * height);
        let dst2 = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);

        idx = padding * width + padding;
        for (let x: number = padding; x < width - padding; x++) {
            idx = x + padding * width;

            let sum =
                xpass[idx - width] +
                xpass[idx] +
                xpass[idx + width];

            dst2[idx] = sum == sumMustBe ? 255 : 0;

            idx += width;

            for (let y: number = padding + 1; y < height - padding; y++) {

                sum -= xpass[idx - width - width];
                sum += xpass[idx + width];

                dst2[idx] = sum == sumMustBe ? 255 : 0;

                idx += width;
            }
        }

        BufferManager.getInstance().releaseUInt8Buffer(xpass);

        return dst2;
    }

    export function dilate(grayscale: Uint8Array, width: number, height: number, dst: Uint8Array = null) {
        if (dst == null)
            dst = new Uint8Array(width * height);


        let padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let hasHigh = grayscale[idx - 1 - width] >= 128 ||
                    grayscale[idx - 0 - width] >= 128 ||
                    grayscale[idx + 1 - width] >= 128 ||
                    grayscale[idx - 1 - 0] >= 128 ||
                    grayscale[idx - 0 - 0] >= 128 ||
                    grayscale[idx + 1 - 0] >= 128 ||
                    grayscale[idx - 1 + width] >= 128 ||
                    grayscale[idx - 0 + width] >= 128 ||
                    grayscale[idx + 1 + width] >= 128;

                if (hasHigh)
                    dst[idx] = 255;

                idx++;
            }
            idx += 2 * padding;
        }
        return dst;
    }

    export function erode(grayscale: Uint8Array, width: number, height: number) {

        let dst = BufferManager.getInstance().getUInt8Buffer(width * height);


        let padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let hasLow =
                    //                    grayscale[idx - 1 - width] < 128 ||
                    grayscale[idx - 0 - width] < 128 ||
                    //grayscale[idx + 1 - width] < 128 ||
                    grayscale[idx - 1 - 0] < 128 ||
                    grayscale[idx - 0 - 0] < 128 ||
                    grayscale[idx + 1 - 0] < 128 ||
                    //    grayscale[idx - 1 + width] < 128 ||
                    grayscale[idx - 0 + width] < 128;// ||
                //    grayscale[idx + 1 + width] < 128;

                if (hasLow)
                    dst[idx] = 0;
                else
                    dst[idx] = 255;

                idx++;
            }
            idx += 2 * padding;
        }
        return dst;
    }

}

namespace PerspectiveOps {
    // Adapted from https://github.com/paulz/PerspectiveTransform/wiki/Matrix-Math


    type Matrix = number[];

    function matrixAdjugate(m: Matrix): Matrix { // Compute the adjugate of m
        return [
            m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
            m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
            m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
        ];
    }

    function matrixMultiply(a: Matrix, b: Matrix): Matrix { // multiply two matrices
        var c = Array(9);
        for (var i = 0; i != 3; ++i) {
            for (var j = 0; j != 3; ++j) {
                var cij = 0;
                for (var k = 0; k != 3; ++k) {
                    cij += a[3 * i + k] * b[3 * k + j];
                }
                c[3 * i + j] = cij;
            }
        }
        return c;
    }
    function multiplyMatrixVector(m: Matrix, v: number[]) { // multiply matrix and vector
        return [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
        ];
    }

    function basisToPoints(x1: number, y1: number,
        x2: number, y2: number,
        x3: number, y3: number,
        x4: number, y4: number): Matrix {
        var m: Matrix = [
            x1, x2, x3,
            y1, y2, y3,
            1, 1, 1
        ];
        var v = multiplyMatrixVector(matrixAdjugate(m), [x4, y4, 1]);
        return matrixMultiply(m, [
            v[0], 0, 0,
            0, v[1], 0,
            0, 0, v[2]
        ]);
    }

    export function general2DProjection(
        x1s: number, y1s: number, x1d: number, y1d: number,
        x2s: number, y2s: number, x2d: number, y2d: number,
        x3s: number, y3s: number, x3d: number, y3d: number,
        x4s: number, y4s: number, x4d: number, y4d: number
    ) {
        var s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
        var d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
        return matrixMultiply(d, matrixAdjugate(s));
    }

    
    export function matrixDeterminant(m: Matrix): number {
        return m[0] * m[4] * m[8] + m[1] * m[5] * m[6] + m[2] * m[3] * m[7] - m[2] * m[4] * m[6] - m[1] * m[3] * m[8] - m[0] * m[5] * m[7];
    }

    export function matrixInverse(m: Matrix): Matrix {
        const det = matrixDeterminant(m);
        const adj = matrixAdjugate(m);
        for (let i = 0; i < m.length; i++)
            adj[i] = adj[i] * 1 / det;
        return adj;
    }

    function project(m: Matrix, x: number, y: number) {
        var v = multiplyMatrixVector(m, [x, y, 1]);
        return [v[0] / v[2], v[1] / v[2]];
    }

}

namespace ConvolutionOps {
    export function applyKernel3x3(kernel: number[], grayscale: Uint8Array, width: number, height: number) {

        let dst: Uint8Array = new Uint8Array(width * height);


        let padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum = grayscale[idx - 1 - width] * kernel[0] +
                    grayscale[idx - 0 - width] * kernel[1] +
                    grayscale[idx + 1 - width] * kernel[2] +
                    grayscale[idx - 1 - 0] * kernel[3] +
                    grayscale[idx - 0 - 0] * kernel[4] +
                    grayscale[idx + 1 - 0] * kernel[5] +
                    grayscale[idx - 1 + width] * kernel[6] +
                    grayscale[idx - 0 + width] * kernel[7] +
                    grayscale[idx + 1 + width] * kernel[8];

                dst[idx] = sum;

                idx++;

            }
            idx += 2 * padding;
        }
        return dst;
    }


    export function applySeparableKernel3x3(kernelX: number[], kernelY: number[], grayscale: Uint8Array, width: number, height: number) {

        let dst: Float32Array = new Float32Array(width * height);

        const padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum =
                    grayscale[idx - 1 - 0] * kernelX[0] +
                    grayscale[idx - 0 - 0] * kernelX[1] +
                    grayscale[idx + 1 - 0] * kernelX[2];
                dst[idx] = sum;

                idx++;
            }
            idx += 2 * padding;
        }

        let dst2: Uint8Array = new Uint8Array(width * height);
        idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum = dst[idx - 0 - width] * kernelY[0] +
                    dst[idx - 0 - 0] * kernelY[1] +
                    dst[idx - 0 + width] * kernelY[2];
                dst2[idx] = sum;

                idx++;
            }
            idx += 2 * padding;
        }
        return dst2;
    }

    export function applySeparableKernel5x5(kernelX: number[], kernelY: number[], grayscale: Uint8Array, width: number, height: number) {

        let xpass: Float32Array = BufferManager.getInstance().getFloatBuffer(width * height);

        let padding = 2;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum =
                    grayscale[idx - 2 - 0] * kernelX[0] +
                    grayscale[idx - 1 - 0] * kernelX[1] +
                    grayscale[idx - 0 - 0] * kernelX[2] +
                    grayscale[idx + 1 - 0] * kernelX[3] +
                    grayscale[idx + 2 - 0] * kernelX[4];
                xpass[idx] = sum;

                idx++;
            }
            idx += 2 * padding;
        }

        //let dst2: Uint8Array = new Uint8Array(width*height);
        let dst2: Uint8Array = BufferManager.getInstance().getUInt8Buffer(width * height);
        idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum =
                    xpass[idx - 0 - width - width] * kernelY[0] +
                    xpass[idx - 0 - width] * kernelY[1] +
                    xpass[idx - 0 - 0] * kernelY[2] +
                    xpass[idx - 0 + width] * kernelY[3] +
                    xpass[idx - 0 + width + width] * kernelY[4];
                dst2[idx] = sum;

                idx++;
            }
            idx += 2 * padding;
        }

        BufferManager.getInstance().releaseFloatBuffer(xpass);

        return dst2;
    }

    export function applySeparableKernel(kernelX: number[], kernelY: number[], grayscale: Uint8Array, width: number, height: number) {

        let dst: Float32Array = new Float32Array(width * height);


        let kernHalfWidth = Math.floor(kernelX.length / 2);
        let kernHalfHeight = Math.floor(kernelY.length / 2);

        let padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum = 0;
                let kIdx = 0;
                for (let k: number = -kernHalfWidth; k <= kernHalfWidth; k++) {
                    sum += grayscale[idx + k] * kernelX[kIdx];
                    kIdx++;
                }
                dst[idx] = sum;
                idx++;
            }
            idx += 2 * padding;
        }

        let dst2: Uint8Array = new Uint8Array(width * height);
        idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let sum = 0;
                let lIdx = 0;
                for (let l: number = -kernHalfHeight; l <= kernHalfHeight; l++) {
                    sum += dst[idx + l * width] * kernelY[lIdx];
                    lIdx++;
                }

                dst2[idx] = sum;

                idx++;
            }
            idx += 2 * padding;
        }
        return dst2;
    }

}

namespace Canny {
    export function applyCanny(padding: number, grayscale: Uint8Array, width: number, height: number, lowThreshold: number, highThreshold: number, removeClustersSmallerThan: number, removeEdgesCloseToDiagonal: boolean) {

        //let dst = new Uint8Array(width * height);
        let dst = BufferManager.getInstance().getUInt8Buffer(width * height);

        let magAng = getMagnitudeAndAngle(grayscale, width, height);
        let mags = magAng.magnitude;
        let angs = magAng.angle;

        // check 0,45,90 and 135° angles and only keep the edge pixels that 
        // which magnitude is both higher than the center

        const oct1 = Math.PI / 8;
        const oct3 = 3 * Math.PI / 8;
        const oct5 = 5 * Math.PI / 8;
        const oct7 = 7 * Math.PI / 8;

        const highThresholdSquared = highThreshold * highThreshold;
        const lowThresholdSquared = lowThreshold * lowThreshold;

        let dataIdx = 0;
        for (let j: number = 0; j < height; j++) {
            for (let i: number = 0; i < width; i++) {


                let angr = angs[dataIdx];
                if (angr < 0) angr += Math.PI;

                let mag = mags[dataIdx];

                let approxDiagonal = Math.abs(Math.cos(angr)) + Math.abs(Math.sin(angr)) - 1;
                // approxDiagonal will be 1 when it's close to diagonals
                if (removeEdgesCloseToDiagonal) {
                    if (approxDiagonal > 0.25) mag = mag * (1 - approxDiagonal) * (1 - approxDiagonal);
                }

                let magIdx = dataIdx;

                if (angr >= 0 && angr <= oct1 || angr > oct7) {
                    // horizontal
                    let left = mags[(magIdx - 1)];
                    let right = mags[(magIdx + 1)];
                    if (mag > left && mag > right) {
                        dst[dataIdx] = 255;
                    }
                    else
                        dst[dataIdx] = 0;

                } else if (angr > oct1 && angr <= oct3) {
                    // 1st diagonal 
                    let leftbottom = mags[(magIdx - 1 + width)];
                    let righttop = mags[(magIdx + 1 - width)];
                    if (mag > leftbottom && mag > righttop)
                        dst[dataIdx] = 255;
                    else
                        dst[dataIdx] = 0;
                }
                else if (angr > oct3 && angr <= oct5) {
                    // vertical
                    let top = mags[(magIdx - width)];
                    let bottom = mags[(magIdx + width)];
                    if (mag > top && mag > bottom)
                        dst[dataIdx] = 255;
                    else
                        dst[dataIdx] = 0;
                }
                else if (angr > oct5 && angr <= oct7) {
                    // 2nd diagonal 
                    let lefttop = mags[(magIdx - 1 - width)];
                    let rightbottom = mags[(magIdx + 1 + width)];
                    if (mag > lefttop && mag > rightbottom)
                        dst[dataIdx] = 255;
                    else
                        dst[dataIdx] = 0;
                }

                if (dst[dataIdx] == 255) {
                    // instead of using the sqrt, just take the precalculated squared of the thresholds
                    // everything is positive so it's fine

                    //let magSqrt = Math.sqrt(mag);
                    if (mag > highThresholdSquared)
                        dst[dataIdx] = 255;
                    else if (mag >= lowThresholdSquared)
                        dst[dataIdx] = 128;
                    else
                        dst[dataIdx] = 0;
                }

                dataIdx++;
            }
        }

        let pointsIdx: number[] = [];

        //let visited = new Uint8Array(width * height);
        let visited = BufferManager.getInstance().getUInt8Buffer(width * height);
        visited.fill(0, 0, visited.length);


        dataIdx = padding * width + padding;
        for (let j: number = padding; j < height - padding; j++) {
            for (let i: number = padding; i < width - padding; i++) {

                if (dst[dataIdx] > 0) {

                    let currentCluster: number[] = [];
                    let isAnyInClusterStrongEdge = false;

                    pointsIdx.push(dataIdx);

                    while (pointsIdx.length > 0) {
                        let pIdx = pointsIdx.pop();
                        if (visited[pIdx] == 0) {
                            visited[pIdx] = 1;
                            let curPointIdx = pIdx;
                            currentCluster.push(curPointIdx);

                            if (dst[curPointIdx] == 255)
                                isAnyInClusterStrongEdge = true;

                            // add all 8 way points around the current point
                            let nextIdx = pIdx - width - 1;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);

                            nextIdx = pIdx - 1;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);
                            nextIdx++;
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);

                            nextIdx = pIdx + width - 1;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0) pointsIdx.push(nextIdx);
                        }
                    }
                    // end of cluster

                    // remove any tiny cluster as well (less than 10px)
                    if (isAnyInClusterStrongEdge && currentCluster.length > removeClustersSmallerThan) {
                        for (let i: number = 0; i < currentCluster.length; i++) {
                            dst[currentCluster[i]] = 255;
                        }
                    }
                    else {
                        for (let i: number = 0; i < currentCluster.length; i++) {
                            dst[currentCluster[i]] = 0;
                        }
                    }

                }
                dataIdx++;
            }
            dataIdx += 2 * padding;
        }

        BufferManager.getInstance().releaseUInt8Buffer(visited);
        BufferManager.getInstance().releaseFloatBuffer(mags);
        BufferManager.getInstance().releaseFloatBuffer(angs);

        return dst;
    }

    function getMagnitudeAndAngle<T>(grayscale: Uint8Array, width: number, height: number) {


        //let mags = new Float32Array(width * height);
        //let angs = new Float32Array(width * height);
        let mags = BufferManager.getInstance().getFloatBuffer(width * height);
        let angs = BufferManager.getInstance().getFloatBuffer(width * height);

        /*  const sobelX = [
              -1, 0, 1,
              -2, 0, 2,
              -1, 0, 1
          ];*/

        const padding = 1;
        let idx = padding * width + padding;
        for (let y: number = padding; y < height - padding; y++) {
            for (let x: number = padding; x < width - padding; x++) {

                let gX2 = 0;
                let gY2 = 0;
                let val;
                val = grayscale[idx - 1 - width];
                gX2 -= val;
                gY2 -= val;

                val = grayscale[idx - 0 - width];
                gY2 -= val << 1;

                val = grayscale[idx + 1 - width];
                gX2 += val;
                gY2 -= val;

                val = grayscale[idx - 1];
                gX2 -= val << 1;

                val = grayscale[idx + 1];
                gX2 += val << 1;

                val = grayscale[idx - 1 + width];
                gX2 -= val;
                gY2 += val;

                val = grayscale[idx + width];
                gY2 += val << 1;

                val = grayscale[idx + width + 1];
                gX2 += val;
                gY2 += val;

                /* let gX2 = grayscale[idx - 1 - width] * sobelX[0] +
                     grayscale[idx - 0 - width] * sobelX[1] +
                     grayscale[idx + 1 - width] * sobelX[2] +
                     grayscale[idx - 1 - 0] * sobelX[3] +
                     grayscale[idx - 0 - 0] * sobelX[4] +
                     grayscale[idx + 1 - 0] * sobelX[5] +
                     grayscale[idx - 1 + width] * sobelX[6] +
                     grayscale[idx - 0 + width] * sobelX[7] +
                     grayscale[idx + 1 + width] * sobelX[8];
     
                 let gY2 = grayscale[idx - 1 - width] * sobelX[0] +
                     grayscale[idx - 0 - width] * sobelX[3] +
                     grayscale[idx + 1 - width] * sobelX[6] +
                     grayscale[idx - 1 - 0] * sobelX[1] +
                     grayscale[idx - 0 - 0] * sobelX[4] +
                     grayscale[idx + 1 - 0] * sobelX[7] +
                     grayscale[idx - 1 + width] * sobelX[2] +
                     grayscale[idx - 0 + width] * sobelX[5] +
                     grayscale[idx + 1 + width] * sobelX[8];
     */
                //mags[idx] = Math.sqrt(gX2 * gX2 + gY2 * gY2);
                // postpone the sqrt to when we actually need the real value
                // half of the time the values are just compared against each other
                // only during the threshold it's checked
                mags[idx] = gX2 * gX2 + gY2 * gY2;

                //angs[idx] = Math.atan2(-gY2, gX2);
                // use approximation for atan2 because no accuracy is required
                // angles are only used to determine which 8-way segment it falls in
                angs[idx] = atan2_approximation1(-gY2, gX2);
                idx++;
            }
            idx += 2 * padding;
        }

        return { magnitude: mags, angle: angs };
    }


    // from https://gist.github.com/volkansalma/2972237
    function atan2_approximation1(y: number, x: number) {
        //http://pubs.opengroup.org/onlinepubs/009695399/functions/atan2.html
        //Volkan SALMA

        const ONEQTR_PI = Math.PI / 4.0;
        const THRQTR_PI = 3.0 * Math.PI / 4.0;
        let r, angle;
        let abs_y = Math.abs(y) + 1e-10;      // kludge to prevent 0/0 condition
        if (x < 0.0) {
            r = (x + abs_y) / (abs_y - x);
            angle = THRQTR_PI;
        }
        else {
            r = (x - abs_y) / (x + abs_y);
            angle = ONEQTR_PI;
        }
        angle += (0.1963 * r * r - 0.9817) * r;
        if (y < 0.0)
            return (-angle);     // negate if in quad III or IV
        else
            return (angle);
    }

}


function isTheSame(arr1: Uint8Array, arr2: Uint8Array) {
    for (let i: number = 0; i < arr1.length; i++) {
        if (arr1[i] != arr2[i]) {
            console.error(i);
            return false;
        }
    }
    return true;
}


function doTime(msg: string, func: Function, toConsole: boolean = true) {
    let start = new Date().getTime();
    func();
    let end = new Date().getTime();

    if (toConsole)
        console.log(msg + ": " + (end - start) + "ms");
    return msg + ": " + (end - start) + "ms";
}


GUI.main();
//testNICKThreshold();

function testNICKThreshold() {
    let img = <HTMLImageElement>document.getElementById("img");
    let c = document.createElement("canvas");
    let ctx = c.getContext("2d");
    c.width = img.width * 10;
    c.height = img.height * 10;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let imgData = ctx.getImageData(0, 0, c.width, c.height);
    let grayscale = new Uint8Array(c.width * c.height);
    let grayscale2 = new Uint8Array(c.width * c.height);
    let grayscale3 = new Uint8Array(c.width * c.height);
    for (let i: number = 0; i < grayscale.length; i++) {
        grayscale[i] = imgData.data[i * 4];
        grayscale2[i] = imgData.data[i * 4];
        grayscale3[i] = imgData.data[i * 4];

    }


    doTime("NICK Threshold", () => {
        ImageOps.binaryThresholdNICK(grayscale, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold", () => {
        ImageOps.binaryThresholdNICK(grayscale2, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold", () => {
        ImageOps.binaryThresholdNICK(grayscale3, c.width, c.height, 19, -0.2, c.width, c.height);
    });

    GUI.saveToCanvas("output", grayscale, c.width, c.height);

    for (let i: number = 0; i < grayscale.length; i++) {
        grayscale[i] = imgData.data[i * 4];
        grayscale2[i] = imgData.data[i * 4];
        grayscale3[i] = imgData.data[i * 4];

    }


    doTime("NICK Threshold cache", () => {
        ImageOps.binaryThresholdNICKCPUCacheOptimized(grayscale, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold cache", () => {
        ImageOps.binaryThresholdNICKCPUCacheOptimized(grayscale2, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold cache", () => {
        ImageOps.binaryThresholdNICKCPUCacheOptimized(grayscale3, c.width, c.height, 19, -0.2, c.width, c.height);
    });

    GUI.saveToCanvas("output", grayscale, c.width, c.height);


    document.getElementById("output").onclick = (ev) => {

        let job = Tesseract.recognize(<HTMLCanvasElement>document.getElementById("output"), {
            lang: 'nld',
        }).progress(message => {
            try {
                (<HTMLProgressElement>document.getElementById("barOCR")).value = message.progress;
            }
            catch (e) {

            }
        })
            .catch(err => console.error(err))
            .then(result => document.getElementById("txtOutput").textContent = result.text)
            .finally(resultOrError => {

            });

    }
}
