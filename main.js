/// <reference path="https://rawgit.com/DefinitelyTyped/DefinitelyTyped/354cec620daccfa0ad167ba046651fb5fef69e8a/types/tesseract.js/index.d.ts"/>
/**
 *  Class that keeps track of image buffers
 *  By reusing previously used buffers the garbage collection is almost completely removed
 *  which removes any spikes during processing
 */
var BufferManager = /** @class */ (function () {
    function BufferManager() {
        this.floatBuffers = {};
        this.uint8Buffers = {};
    }
    BufferManager.prototype.getFloatBuffer = function (length) {
        var availableBuffers = this.floatBuffers[length];
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
    };
    BufferManager.prototype.releaseFloatBuffer = function (buffer) {
        this.floatBuffers[buffer.length].push(buffer);
        // console.log("Releasing buffer of length " + buffer.length + ", there are " + this.floatBuffers[buffer.length].length + " buffers available");
    };
    BufferManager.prototype.getUInt8Buffer = function (length) {
        // console.log("Getting buffer of length " + length);
        var availableBuffers = this.uint8Buffers[length];
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
    };
    BufferManager.prototype.releaseUInt8Buffer = function (buffer) {
        this.uint8Buffers[buffer.length].push(buffer);
        //        console.log("Releasing buffer of length " + buffer.length + ", there are " + this.uint8Buffers[buffer.length].length + " buffers available");
    };
    BufferManager.getInstance = function () {
        if (BufferManager.instance == null)
            BufferManager.instance = new BufferManager();
        return BufferManager.instance;
    };
    BufferManager.instance = null;
    return BufferManager;
}());
var GUI = /** @class */ (function () {
    function GUI() {
    }
    GUI.main = function () {
        // create the smaller and full canvases only once
        GUI.smallCanvas = document.createElement("canvas");
        GUI.fullCanvas = document.createElement("canvas");
        GUI.lastFullCanvasImage = document.createElement("canvas");
        var video = document.querySelector("#videoElement");
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;
        if (navigator.getUserMedia) {
            var constraints_1 = {
                video: { facingMode: { exact: "environment" }, width: { exact: 1920 }, height: { exact: 1080 } },
                audio: false
            };
            // get webcam feed if available
            navigator.getUserMedia(constraints_1, function (stream) { return GUI.handleVideo(video, stream); }, function () {
                // try without facing mode
                constraints_1 = {
                    video: true,
                    audio: false
                };
                navigator.getUserMedia(constraints_1, function (stream) { return GUI.handleVideo(video, stream); }, function (err) {
                    alert("Unable to initialize video: " + JSON.stringify(err));
                });
            });
        }
        document.getElementById("toggleDebug").onclick = function (ev) {
            GUI.debug = !GUI.debug;
            document.getElementById("debugstuff").style.display = GUI.debug ? "block" : "none";
        };
        document.getElementById("videoContainer").onclick = function (ev) {
            GUI.isPaused = !GUI.isPaused;
        };
        document.getElementById("output").onclick = function (ev) {
            if (GUI.isWorkingOnOCR)
                return;
            if (GUI.lastExtractResult == null)
                return;
            GUI.isWorkingOnOCR = true;
            var targetCanvas = document.createElement("canvas");
            var warpResult = Algorithm.warpExtractedResultAndPrepareForOCR(GUI.lastFullCanvasImage, targetCanvas, GUI.lastExtractResult, GUI.warpSettings, GUI.debug);
            //document.body.appendChild(targetCanvas);
            var job = Tesseract.recognize(targetCanvas, {
                lang: 'eng',
            }).progress(function (message) {
                try {
                    document.getElementById("barOCR").value = message.progress;
                }
                catch (e) {
                }
            }).catch(function (err) { return console.error(err); })
                .then(function (result) { return document.getElementById("txtOutput").textContent = result.text; })
                .finally(function (resultOrError) {
                GUI.isWorkingOnOCR = false;
            });
        };
    };
    GUI.handleVideo = function (video, stream) {
        // if found attach feed to video element
        video.srcObject = stream;
        window.setInterval(function () {
            if (GUI.isWorkingOnOCR || GUI.isPaused)
                return;
            if (video.videoWidth != 0 && video.videoHeight != 0) {
                // have the video overlay match the video input
                document.getElementById("videoContainer").style.height = video.videoHeight;
                document.getElementById("videoContainer").style.width = video.videoWidth;
                if (document.getElementById("videoOverlay").width != video.videoWidth)
                    document.getElementById("videoOverlay").width = video.videoWidth;
                if (document.getElementById("videoOverlay").height != video.videoHeight)
                    document.getElementById("videoOverlay").height = video.videoHeight;
                // draw the video to the canvases
                GUI.updateCanvases(video, GUI.extractSettings);
                var targetCanvas = document.getElementById("output");
                var extractResult = Algorithm.extractBiggestRectangularArea(GUI.extractSettings, GUI.smallCanvas, GUI.debug);
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
                    // warp the smaller canvas to the output. When the OCR process is started the cached lastFullCanvasImage will be used
                    // to warp & threshold for better quality
                    var warpResult = Algorithm.warpExtractedResultAndPrepareForOCR(GUI.smallCanvas, targetCanvas, extractResult, GUI.warpSettings, GUI.debug);
                    document.getElementById("txt").innerHTML = extractResult.timing.concat(warpResult.timing).join("<br/>");
                }
                else
                    document.getElementById("txt").innerHTML = extractResult.timing.join("<br/>");
            }
        }, 10);
    };
    GUI.updateCanvases = function (video, settings) {
        var w = video.videoWidth;
        var h = video.videoHeight;
        if (w > settings.contourSearchingWidth) {
            w = settings.contourSearchingWidth;
            h = Math.floor(video.videoHeight / video.videoWidth * settings.contourSearchingWidth);
        }
        if (GUI.smallCanvas.width != w || GUI.smallCanvas.height != h) {
            GUI.smallCanvas.width = w;
            GUI.smallCanvas.height = h;
        }
        var ctx = GUI.smallCanvas.getContext("2d");
        ctx.drawImage(video, 0, 0, GUI.smallCanvas.width, GUI.smallCanvas.height);
        var multiplier = 1;
        if (GUI.fullCanvas.width != video.videoWidth * multiplier || GUI.fullCanvas.height != video.videoHeight * multiplier) {
            GUI.fullCanvas.width = video.videoWidth * multiplier;
            GUI.fullCanvas.height = video.videoHeight * multiplier;
        }
        var fullCtx = GUI.fullCanvas.getContext("2d");
        fullCtx.drawImage(video, 0, 0, GUI.fullCanvas.width, GUI.fullCanvas.height);
    };
    GUI.drawExtractedResultOnOverlay = function (extractResult) {
        var overlay = document.getElementById("videoOverlay");
        var overlayCtx = overlay.getContext("2d");
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
    };
    GUI.saveToCanvas = function (elementId, grayscale, width, height) {
        var debugCanvas = document.getElementById(elementId);
        debugCanvas.width = width;
        debugCanvas.height = height;
        var ctx = debugCanvas.getContext("2d");
        var srcData = ctx.getImageData(0, 0, width, height);
        var dataIdx = 0;
        for (var idx = 0; idx < grayscale.length; idx++) {
            srcData.data[dataIdx] = grayscale[idx];
            srcData.data[dataIdx + 1] = grayscale[idx];
            srcData.data[dataIdx + 2] = grayscale[idx];
            srcData.data[dataIdx + 3] = 255;
            dataIdx += 4;
        }
        ctx.putImageData(srcData, 0, 0);
    };
    GUI.drawHistogram = function (elementId, grayscale, width, height) {
        var hist = new Array(256);
        for (var i = 0; i < 256; i++)
            hist[i] = 0;
        var max = Number.MIN_VALUE;
        for (var idx = 0; idx < grayscale.length; idx++) {
            hist[grayscale[idx]]++;
            if (max < hist[grayscale[idx]])
                max = hist[grayscale[idx]];
        }
        var histCanvas = document.getElementById(elementId);
        var ctx = histCanvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 256, 256);
        //ctx.translate(-0.5, -0.5);
        ctx.fillStyle = "black";
        for (var i = 0; i < 256; i++) {
            var h = hist[i] / max * 256;
            ctx.fillRect(i, 256 - h, 1, h);
        }
    };
    GUI.isWorkingOnOCR = false;
    GUI.isPaused = false;
    GUI.debug = false;
    GUI.lastExtractResult = null;
    GUI.extractSettings = {
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
    GUI.warpSettings = {
        nickThresholdWindowSize: 19,
        nickThresholdK: -0.1
    };
    return GUI;
}());
var Algorithm;
(function (Algorithm) {
    var ExtractResult = /** @class */ (function () {
        function ExtractResult() {
            this.leftTop = null;
            this.rightTop = null;
            this.leftBottom = null;
            this.rightBottom = null;
            this.success = false;
            this.timing = [];
        }
        return ExtractResult;
    }());
    Algorithm.ExtractResult = ExtractResult;
    var WarpAndPrepareResult = /** @class */ (function () {
        function WarpAndPrepareResult() {
            this.timing = [];
        }
        return WarpAndPrepareResult;
    }());
    Algorithm.WarpAndPrepareResult = WarpAndPrepareResult;
    /**
     *  Searches for the biggest rectangular-like contour in the image and returns the 4 corners if found
     */
    function extractBiggestRectangularArea(settings, canvas, debug) {
        var ctx = canvas.getContext("2d");
        var w = canvas.width;
        var h = canvas.height;
        var srcData = ctx.getImageData(0, 0, w, h);
        var result = new ExtractResult();
        //let grayscale = new Uint8Array(srcData.width *srcData.height);
        var grayscale = BufferManager.getInstance().getUInt8Buffer(srcData.width * srcData.height);
        result.timing.push(doTime("Grayscale", function () {
            var dataIdx = 0;
            for (var idx = 0; idx < grayscale.length; idx++) {
                grayscale[idx] = (srcData.data[dataIdx] + srcData.data[dataIdx + 1] + srcData.data[dataIdx + 2]) / 3;
                dataIdx += 4;
            }
        }, false));
        //stretchHistogram(grayscale, srcData.width, srcData.height);
        result.timing.push(doTime("Enhance contrast", function () {
            ImageOps.enhanceContrast(grayscale, settings.enhanceContrastFactor);
        }, false));
        var gaussian;
        result.timing.push(doTime("Gaussian blur", function () {
            /* grayscale = applyKernel3x3([
                 1 / 16, 1 / 8, 1 / 16,
                 1 / 8, 1 / 4, 1 / 8,
                 1 / 16, 1 / 8, 1 / 16], grayscale, srcData.width, srcData.height);
             grayscale = applyKernel3x3([
                 1 / 16, 1 / 8, 1 / 16,
                 1 / 8, 1 / 4, 1 / 8,
                 1 / 16, 1 / 8, 1 / 16], grayscale, srcData.width, srcData.height);
    */
            var gauss = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136];
            gaussian = ConvolutionOps.applySeparableKernel5x5(gauss, gauss, grayscale, srcData.width, srcData.height);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = gaussian;
            //    grayscale = applyKernel3x3([1/9, 1/9, 1/9, 1/9,1/9,1/9, 1/9, 1/9, 1/9], grayscale, srcData.width, srcData.height);
        }, false));
        var cannyLowerThreshold;
        var cannyHigherThreshold;
        result.timing.push(doTime("Median", function () {
            var med = ImageOps.median(grayscale);
            var sigma = settings.cannyThresholdSigmaMultiplier * 0.33;
            cannyLowerThreshold = Math.max(0, (1 - sigma) * med);
            cannyHigherThreshold = Math.min(255, (1 + sigma) * med);
        }, false));
        if (debug) {
            GUI.saveToCanvas("preCanny", grayscale, srcData.width, srcData.height);
            GUI.drawHistogram("histogram", grayscale, srcData.width, srcData.height);
        }
        result.timing.push(doTime("Canny", function () {
            var canny = Canny.applyCanny(settings.borderPadding, grayscale, srcData.width, srcData.height, cannyLowerThreshold, cannyHigherThreshold, settings.removeCannyClustersSmallerThan, settings.removeCannyEdgesCloseToDiagonal);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = canny;
        }, false));
        if (debug)
            GUI.saveToCanvas("postCanny", grayscale, srcData.width, srcData.height);
        result.timing.push(doTime("Remove border", function () {
            removeBorder(settings.borderPadding, grayscale, srcData.width, srcData.height);
        }, false));
        result.timing.push(doTime("Dilate & erode", function () {
            /*grayscale = dilate(grayscale, srcData.width, srcData.height);
            grayscale = dilate(grayscale, srcData.width, srcData.height);
            grayscale = dilate(grayscale, srcData.width, srcData.height);
            grayscale = dilate(grayscale, srcData.width, srcData.height);
           
            grayscale = erode(grayscale, srcData.width, srcData.height);
            grayscale = erode(grayscale, srcData.width, srcData.height);
            grayscale = erode(grayscale, srcData.width, srcData.height);
            grayscale = erode(grayscale, srcData.width, srcData.height);*/
            var dilated = MorphologicalOps.dilateFast(grayscale, srcData.width, srcData.height, 9, srcData.width, srcData.height); //MorphologicalOps.dilate4Fast(grayscale, srcData.width, srcData.height);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = dilated;
            var eroded = MorphologicalOps.erodeFast(grayscale, srcData.width, srcData.height, 9, srcData.width, srcData.height);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            grayscale = eroded;
        }, false));
        if (debug)
            GUI.saveToCanvas("morph", grayscale, srcData.width, srcData.height);
        var allContours;
        result.timing.push(doTime("Trace contours", function () {
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
        var bestContour = null;
        var bestContourHull = null;
        var bestContourCorners = null;
        result.timing.push(doTime("Find best contour", function () {
            var width = srcData.width;
            var height = srcData.height;
            var result = findBestContour(allContours, width, height, settings);
            bestContour = result.contour;
            bestContourHull = result.hull;
            bestContourCorners = result.corners;
        }, false));
        if (debug) {
            var cIdx = 0;
            var colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];
            var contourResult = document.getElementById("contourResult");
            var ctx_1 = contourResult.getContext("2d");
            for (var _i = 0, allContours_1 = allContours; _i < allContours_1.length; _i++) {
                var contour = allContours_1[_i];
                var c = colors[cIdx++ % colors.length];
                ctx_1.strokeStyle = "rgb(" + c[0] + ", " + c[1] + ", " + c[2];
                ctx_1.lineWidth = 1;
                ctx_1.beginPath();
                var x0 = contour[0] % srcData.width;
                var y0 = Math.floor(contour[0] / srcData.width);
                ctx_1.moveTo(x0, y0);
                var oldx = x0;
                var oldy = y0;
                for (var i = 1; i < contour.length; i++) {
                    var x = contour[i] % srcData.width;
                    var y = Math.floor(contour[i] / srcData.width);
                    oldx = x;
                    oldy = y;
                    ctx_1.lineTo(x, y);
                }
                ctx_1.stroke();
            }
        }
        if (bestContour != null) {
            //console.warn(bestContour);
            if (debug) {
                var contourResult = document.getElementById("contourResult");
                var ctx_2 = contourResult.getContext("2d");
                var cIdx = 0;
                var color = [255, 0, 0];
                ctx_2.strokeStyle = "rgb(" + color[0] + ", " + color[1] + ", " + color[2];
                ctx_2.lineWidth = 2;
                ctx_2.beginPath();
                var x0 = bestContour[0] % srcData.width;
                var y0 = Math.floor(bestContour[0] / srcData.width);
                ctx_2.moveTo(x0, y0);
                var oldx = x0;
                var oldy = y0;
                for (var i = 1; i < bestContour.length; i++) {
                    var x = bestContour[i] % srcData.width;
                    var y = Math.floor(bestContour[i] / srcData.width);
                    oldx = x;
                    oldy = y;
                    ctx_2.lineTo(x, y);
                }
                ctx_2.stroke();
                ctx_2.fillStyle = "rgb(" + color[0] + ", " + color[1] + ", " + color[2];
                for (var i = 0; i < bestContourHull.length; i++) {
                    var x = bestContourHull[i] % srcData.width;
                    var y = Math.floor(bestContourHull[i] / srcData.width);
                    ctx_2.beginPath();
                    ctx_2.arc(x, y, 3, 0, Math.PI * 2, false);
                    ctx_2.fill();
                }
                // draw starting point
                ctx_2.fillStyle = "gray";
                ctx_2.beginPath();
                ctx_2.arc(x0, y0, 5, 0, Math.PI * 2, false);
                ctx_2.fill();
                // draw end point
                ctx_2.fillStyle = "#FFAA00";
                ctx_2.beginPath();
                ctx_2.arc(oldx, oldy, 3, 0, Math.PI * 2, false);
                ctx_2.fill();
                // draw the center of the polygon
                var center_1 = ContourOps.centerOfPolygon(bestContour, srcData.width);
                var centerX_1 = center_1 % srcData.width;
                var centerY_1 = Math.floor(center_1 / srcData.width);
                ctx_2.fillStyle = "#55AA55";
                ctx_2.beginPath();
                ctx_2.arc(centerX_1, centerY_1, 5, 0, Math.PI * 2, false);
                ctx_2.fill();
                // draw the corners that were found
                for (var i = 0; i < bestContourCorners.length; i++) {
                    var x = bestContourCorners[i] % srcData.width;
                    var y = Math.floor(bestContourCorners[i] / srcData.width);
                    ctx_2.strokeStyle = "#55AA55";
                    ctx_2.beginPath();
                    ctx_2.lineWidth = 1;
                    ctx_2.moveTo(centerX_1, centerY_1);
                    ctx_2.lineTo(x, y);
                    ctx_2.stroke();
                }
            }
            var center = ContourOps.centerOfPolygon(bestContour, srcData.width);
            var centerX = center % srcData.width;
            var centerY = Math.floor(center / srcData.width);
            // classify the 4 corners into the separate quadrants
            var leftTop = null;
            var rightTop = null;
            var leftBottom = null;
            var rightBottom = null;
            for (var i = 0; i < bestContourCorners.length; i++) {
                var x = bestContourCorners[i] % srcData.width;
                var y = Math.floor(bestContourCorners[i] / srcData.width);
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
    Algorithm.extractBiggestRectangularArea = extractBiggestRectangularArea;
    /**
     *  Removes the border of the image, setting it to black
     */
    function removeBorder(padding, grayscale, width, height) {
        var idx = 0;
        for (var i = 0; i < padding * width; i++) {
            grayscale[idx] = 0;
            idx++;
        }
        for (var y = padding; y < height - padding; y++) {
            for (var x = 0; x < padding; x++) {
                grayscale[idx] = 0;
                idx++;
            }
            idx += width - 2 * padding;
            for (var x = 0; x < padding; x++) {
                grayscale[idx] = 0;
                idx++;
            }
        }
        for (var i = 0; i < padding * width; i++) {
            grayscale[idx] = 0;
            idx++;
        }
    }
    /**
     *  Try to find the biggest area contour but constrained to the settings, such as not too close to the border of the image,
     *  have a minimum area, must be somewhat closed, must be close to convex, has to have 4 corners, etc.
     */
    function findBestContour(allContours, width, height, settings) {
        var bestContour = null;
        var bestContourHull = null;
        var bestContourCorners = null;
        var maxArea = Number.MIN_VALUE;
        for (var _i = 0, allContours_2 = allContours; _i < allContours_2.length; _i++) {
            var rawContour = allContours_2[_i];
            var hull = ContourOps.convexHull(rawContour, width);
            var area = Math.abs(ContourOps.polygonArea(rawContour, width));
            var hullarea = Math.abs(ContourOps.polygonArea(hull, width));
            var closeToBorderPointCount = 0;
            for (var i = 0; i < rawContour.length; i++) {
                var x = rawContour[i] % width;
                var y = Math.floor(rawContour[i] / width);
                if (x <= settings.borderPadding + 1 || x >= width - settings.borderPadding - 1 || y <= settings.borderPadding + 1 || y >= height - settings.borderPadding - 1)
                    closeToBorderPointCount++;
            }
            // todo put the close to border count in settings
            if (closeToBorderPointCount < 100) {
                if (area / hullarea > settings.contourAreaToHullAreaMinimumRatio) {
                    if (Math.abs(area) > width * height * settings.contourMininumAreaPercentage) {
                        var x0 = rawContour[0] % width;
                        var y0 = Math.floor(rawContour[0] / width);
                        var xlast = rawContour[rawContour.length - 1] % width;
                        var ylast = Math.floor(rawContour[rawContour.length - 1] / width);
                        var dist = Math.abs(x0 - xlast) + Math.abs(y0 - ylast);
                        if (dist < settings.contourStartAndEndPointsMaximumDistancePercentage * Math.max(width, height)) {
                            // check if angles between prevP - curP and curP - nextP are > 60°
                            var angles = ContourOps.innerAnglesOfPolygon(hull, width);
                            // and all angles are always >= 80°
                            if (angles.filter(function (a) { return a < settings.contourPointsMinimumAngleBetweenPoints || a > 360 - settings.contourPointsMinimumAngleBetweenPoints; }).length == 0) {
                                var cornerPoints = ContourOps.findCorners(rawContour, width);
                                if (cornerPoints.length == 4) {
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
    function warpExtractedResultAndPrepareForOCR(canvas, targetCanvas, extractResult, settings, debug) {
        var fullCtx = canvas.getContext("2d");
        var videoImageData = fullCtx.getImageData(0, 0, canvas.width, canvas.height);
        var grayscale = BufferManager.getInstance().getUInt8Buffer(videoImageData.width * videoImageData.height);
        var warpResult = new WarpAndPrepareResult();
        warpResult.timing.push(doTime("Full grayscale", function () {
            var dataIdx = 0;
            for (var idx_1 = 0; idx_1 < grayscale.length; idx_1++) {
                grayscale[idx_1] = (videoImageData.data[dataIdx] + videoImageData.data[dataIdx + 1] + videoImageData.data[dataIdx + 2]) / 3;
                dataIdx += 4;
            }
        }, false));
        var result;
        warpResult.timing.push(doTime("Warp perspective", function () {
            result = processPerspective(grayscale, videoImageData.width, videoImageData.height, extractResult.leftTop, extractResult.rightTop, extractResult.leftBottom, extractResult.rightBottom);
            BufferManager.getInstance().releaseUInt8Buffer(grayscale);
            //enhanceContrast(result.data, 2.5);
            if (debug)
                GUI.saveToCanvas("warpPerspectiveResult", result.data, result.width, result.height);
        }, false));
        var thresh;
        warpResult.timing.push(doTime("NICK Binary Threshold", function () {
            thresh = result.data;
            ImageOps.binaryThresholdNICK(thresh, result.width, result.height, settings.nickThresholdWindowSize, settings.nickThresholdK, videoImageData.width, videoImageData.height);
        }, false));
        warpResult.timing.push(doTime("Erode", function () {
            var erode = MorphologicalOps.erode1Fast(thresh, result.width, result.height, videoImageData.width, videoImageData.height);
            BufferManager.getInstance().releaseUInt8Buffer(thresh);
            thresh = erode;
        }, false));
        // copy it to the target canvas
        targetCanvas.width = result.width;
        targetCanvas.height = result.height;
        var targetCtx = targetCanvas.getContext("2d");
        var targetData = targetCtx.createImageData(result.width, result.height);
        var targetArr = targetData.data;
        var idx = 0;
        for (var i = 0; i < thresh.length; i++) {
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
    Algorithm.warpExtractedResultAndPrepareForOCR = warpExtractedResultAndPrepareForOCR;
    /**
     *  Warps the perspective (similar to open cv's warp perspective)
     *  Each pixel in the target image gets looked up into the source image with the
     *  PerspectiveOps.project(i,j), but this is refactored to reduce the nr of operations
     */
    function processPerspective(srcArray, srcWidth, srcHeight, leftTopCorner, rightTopCorner, leftBottomCorner, rightBottomCorner) {
        // length of left edge / length of top edge gives the ratio
        var v0x = leftBottomCorner[0] * srcWidth - leftTopCorner[0] * srcWidth;
        var v0y = leftBottomCorner[1] * srcHeight - leftTopCorner[1] * srcHeight;
        var v1x = rightTopCorner[0] * srcWidth - leftTopCorner[0] * srcWidth;
        var v1y = rightTopCorner[1] * srcHeight - leftTopCorner[1] * srcHeight;
        var leftEdgeLength = Math.sqrt(v0x * v0x + v0y * v0y);
        var topEdgeLength = Math.sqrt(v1x * v1x + v1y * v1y);
        // console.log("Top edge: " + topEdgeLength + " vs left " + leftEdgeLength);
        var ratio = leftEdgeLength / topEdgeLength;
        var targetHeight;
        var targetWidth;
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
            var resizeRatio = 1 / targetWidth * srcWidth;
            targetWidth = srcWidth;
            targetHeight = targetHeight * resizeRatio;
        }
        if (targetHeight > srcHeight) {
            var resizeRatio = 1 / targetHeight * srcHeight;
            targetWidth = targetWidth * resizeRatio;
            targetHeight = srcHeight;
        }
        targetWidth = Math.floor(targetWidth);
        targetHeight = Math.floor(targetHeight);
        // console.log("target: " + targetWidth + "x" + targetHeight);
        var transform = PerspectiveOps.general2DProjection(0, 0, leftTopCorner[0], leftTopCorner[1], // lt
        1, 0, rightTopCorner[0], rightTopCorner[1], // rt
        0, 1, leftBottomCorner[0], leftBottomCorner[1], // lb
        1, 1, rightBottomCorner[0], rightBottomCorner[1]);
        //let targetArray = new Uint8Array(targetWidth * targetHeight);
        // make the buffer larger than it's supposed to be
        // it's not necessary if it runs once, but keeping it the same size as the source
        // means the buffer can be reused later and as these are can be quite large which 
        // would save a lot in memory allocation
        var targetArray = BufferManager.getInstance().getUInt8Buffer(srcWidth * srcHeight);
        var targetIdx = 0;
        // transform per pixel on a full HD image is way too slow on phones
        // instead project every blockSize pixels and then linearly interpolate between the points
        var dx = 1 / targetWidth;
        var dy = 1 / targetHeight;
        var t0dx = transform[0] * dx;
        var t3dx = transform[3] * dx;
        var t6dx = transform[6] * dx;
        var t1dy = transform[1] * dy;
        var t4dy = transform[4] * dy;
        var t7dy = transform[7] * dy;
        var t1 = 0 + transform[2];
        var t4 = 0 + transform[5];
        var t7 = 0 + transform[8];
        for (var y = 0; y < targetHeight; y++) {
            //let pxPart = transform[1] * j + transform[2];
            //let pyPart = transform[4] * j + transform[5];
            //let pzPart = transform[7] * j + transform[8];
            var pxPart = t1;
            var pyPart = t4;
            var pzPart = t7;
            var t0 = 0;
            var t3 = 0;
            var t6 = 0;
            for (var x = 0; x < targetWidth; x++) {
                //let px = transform[0] * i + pxPart;
                //let py = transform[3] * i + pyPart;
                //let pz = transform[6] * i + pzPart;
                var px = t0 + pxPart;
                var py = t3 + pyPart;
                var pz = t6 + pzPart;
                var srcX = pz == 0 ? 0 : ~~(px / pz * srcWidth);
                if (srcX >= 0 && srcX < srcWidth) {
                    var srcY = pz == 0 ? 0 : ~~(py / pz * srcHeight);
                    if (srcY >= 0 && srcY < srcHeight) {
                        var idx = (srcY * srcWidth + srcX);
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
})(Algorithm || (Algorithm = {}));
var ContourOps;
(function (ContourOps) {
    function angleBetween(prev, cur, next, width) {
        var xprev = prev % width;
        var yprev = Math.floor(prev / width);
        var xcur = cur % width;
        var ycur = Math.floor(cur / width);
        var xnext = next % width;
        var ynext = Math.floor(next / width);
        var v1x = xprev - xcur;
        var v1y = yprev - ycur;
        var v2x = xnext - xcur;
        var v2y = ynext - ycur;
        var dot = v1x * v2x + v1y * v2y;
        var lenv1 = Math.sqrt(v1x * v1x + v1y * v1y);
        var lenv2 = Math.sqrt(v2x * v2x + v2y * v2y);
        var cos = dot / (lenv1 * lenv2);
        return Math.round(Math.acos(cos) / Math.PI * 180);
    }
    function findCorners(contour, width) {
        // find the 4 points that are furthest from the center and have at least 45° between them
        var minimumAngle = 45;
        var center = centerOfPolygon(contour, width);
        var centerX = center % width;
        var centerY = Math.floor(center / width);
        var bestPoints = [];
        var distancesSquared = new Array(contour.length);
        for (var i = 0; i < contour.length; i++) {
            var x = contour[i] % width;
            var y = Math.floor(contour[i] / width);
            distancesSquared[i] = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
        }
        var visited = new Array(contour.length);
        while (bestPoints.length < 4) {
            var maxDistance = Number.MIN_VALUE;
            var maxDistanceIndex = -1;
            for (var i = 0; i < contour.length; i++) {
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
            var canAdd = true;
            for (var i = 0; i < bestPoints.length && canAdd; i++) {
                var angle = angleBetween(bestPoints[i], center, contour[maxDistanceIndex], width);
                if (angle < minimumAngle || angle > 360 - minimumAngle)
                    canAdd = false;
            }
            if (canAdd && maxDistanceIndex != -1)
                bestPoints.push(contour[maxDistanceIndex]);
        }
        return bestPoints;
    }
    ContourOps.findCorners = findCorners;
    function spiralAround(sx, sy, width, height, func) {
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
                for (var i = l; i <= r + edgeWidth; i++) {
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
                for (var i = t; i <= b + edgeWidth; i++) {
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
                for (var i = r; i >= l - edgeWidth; i--) {
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
                for (var i = b; i >= t - edgeWidth; i--) {
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
    function traceContours(padding, grayscale, width, height) {
        var allContours = [];
        var Direction;
        (function (Direction) {
            Direction[Direction["Right"] = 0] = "Right";
            Direction[Direction["Bottom"] = 1] = "Bottom";
            Direction[Direction["Left"] = 2] = "Left";
            Direction[Direction["Top"] = 3] = "Top";
        })(Direction || (Direction = {}));
        var Position;
        (function (Position) {
            Position[Position["LeftFront"] = 0] = "LeftFront";
            Position[Position["Front"] = 1] = "Front";
            Position[Position["RightFront"] = 2] = "RightFront";
            Position[Position["Right"] = 3] = "Right";
            Position[Position["RightRear"] = 4] = "RightRear";
            Position[Position["Rear"] = 5] = "Rear";
            Position[Position["LeftRear"] = 6] = "LeftRear";
            Position[Position["Left"] = 7] = "Left";
        })(Position || (Position = {}));
        // contour 
        var getX = function (pos, dir) {
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
        var getY = function (pos, dir) {
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
        var getDirection = function (pos, dir) {
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
        var visited = new Uint8Array(width * height);
        var stop = false;
        //    for (let startY: number = rangeTop; startY < rangeBottom && !stop; startY++) {
        //        for (let startX: number = rangeLeft; startX < rangeRight && !stop; startX++) {
        spiralAround(Math.floor(width / 2), Math.floor(height / 2), width, height, function (startX, startY) {
            var dataIdx = startY * width + startX;
            // not visited, current position is on contour and rear is empty
            if (visited[dataIdx] == 0 && grayscale[dataIdx] >= 128 && (startX == 0 || grayscale[dataIdx - 1] < 128)) {
                // start point
                var startD = Direction.Right;
                var curX = startX;
                var curY = startY;
                var curD = startD;
                var it = 0;
                // console.log("Start of new contour at " + curX + "," + curY);
                var contour = [];
                //  let log: string[] = [];
                var curIdx = curY * width + curX;
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
                    var pLeftRearX = curX + getX(Position.LeftRear, curD);
                    var pLeftRearY = curY + getY(Position.LeftRear, curD);
                    var pLeftRearIdx = pLeftRearY * width + pLeftRearX;
                    // stage 1
                    if (grayscale[pLeftRearIdx] >= 128) {
                        var pLeftX = curX + getX(Position.Left, curD);
                        var pLeftY = curY + getY(Position.Left, curD);
                        var pLeftIdx = pLeftY * width + pLeftX;
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
                    }
                    else {
                        var pLeftX = curX + getX(Position.Left, curD);
                        var pLeftY = curY + getY(Position.Left, curD);
                        var pLeftIdx = pLeftY * width + pLeftX;
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
                    var pFrontLeftX = curX + getX(Position.LeftFront, curD);
                    var pFrontLeftY = curY + getY(Position.LeftFront, curD);
                    var pFrontLeftIdx = pFrontLeftY * width + pFrontLeftX;
                    var pFrontX = curX + getX(Position.Front, curD);
                    var pFrontY = curY + getY(Position.Front, curD);
                    var pFrontIdx = pFrontY * width + pFrontX;
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
                        console.warn("Too many iterations!");
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
    ContourOps.traceContours = traceContours;
    function centerOfPolygon(contour, width) {
        var sumX = 0;
        var sumY = 0;
        for (var i = 0; i < contour.length; i++) {
            sumX += contour[i] % width;
            sumY += Math.floor(contour[i] / width);
        }
        var centerX = Math.floor(sumX / contour.length);
        var centerY = Math.floor(sumY / contour.length);
        return centerY * width + centerX;
    }
    ContourOps.centerOfPolygon = centerOfPolygon;
    /**
     * @param points An array of [X, Y] coordinates
     *  from: https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain
     */
    function convexHull(contour, width) {
        var points = new Array(contour.length);
        var idx = 0;
        for (var i = 0; i < contour.length; i++) {
            var x = contour[i] % width;
            var y = Math.floor(contour[i] / width);
            points[idx] = [x, y];
            idx++;
        }
        function cross(a, b, o) {
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        }
        points.sort(function (a, b) {
            return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
        });
        var lower = [];
        for (var i = 0; i < points.length; i++) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
                lower.pop();
            }
            lower.push(points[i]);
        }
        var upper = [];
        for (var i = points.length - 1; i >= 0; i--) {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
                upper.pop();
            }
            upper.push(points[i]);
        }
        upper.pop();
        lower.pop();
        return lower.concat(upper).map(function (v) { return v[1] * width + v[0]; });
    }
    ContourOps.convexHull = convexHull;
    function innerAnglesOfPolygon(contour, width) {
        var angles = [];
        if (contour.length > 3) {
            for (var i = 0; i < contour.length; i++) {
                var prevIdx = i - 1;
                if (prevIdx < 0)
                    prevIdx = contour.length - 1;
                var nextIdx = i + 1;
                if (nextIdx >= contour.length)
                    nextIdx = 0;
                var xprev = contour[prevIdx] % width;
                var yprev = Math.floor(contour[prevIdx] / width);
                var xcur = contour[i] % width;
                var ycur = Math.floor(contour[i] / width);
                var xnext = contour[nextIdx] % width;
                var ynext = Math.floor(contour[nextIdx] / width);
                var v1x = xprev - xcur;
                var v1y = yprev - ycur;
                var v2x = xnext - xcur;
                var v2y = ynext - ycur;
                var dot = v1x * v2x + v1y * v2y;
                var lenv1 = Math.sqrt(v1x * v1x + v1y * v1y);
                var lenv2 = Math.sqrt(v2x * v2x + v2y * v2y);
                var cos = dot / (lenv1 * lenv2);
                angles.push(Math.round(Math.acos(cos) / Math.PI * 180));
                // cos ang = dot / len(v1) * len(v2)
            }
        }
        return angles;
    }
    ContourOps.innerAnglesOfPolygon = innerAnglesOfPolygon;
    /**
     * Calculates the area of the polygon
     * from: https://stackoverflow.com/questions/16285134/calculating-polygon-area
     */
    function polygonArea(contour, width) {
        var area = 0; // Accumulates area in the loop   
        var j = contour.length - 1; // The last vertex is the 'previous' one to the first
        for (var i = 0; i < contour.length; i++) {
            var xi = contour[i] % width;
            var yi = Math.floor(contour[i] / width);
            var xj = contour[j] % width;
            var yj = Math.floor(contour[j] / width);
            area = area + (xj + xi) * (yj - yi);
            j = i; //j is previous vertex to i
        }
        return area / 2;
    }
    ContourOps.polygonArea = polygonArea;
})(ContourOps || (ContourOps = {}));
var ImageOps;
(function (ImageOps) {
    function median(grayscale) {
        var buckets = new Array(256);
        for (var i = 0; i < grayscale.length; i++)
            buckets[grayscale[i]] = 0;
        for (var i = 0; i < grayscale.length; i++)
            buckets[grayscale[i]]++;
        var median = -1;
        var halfPoint = grayscale.length / 2;
        var count = 0;
        for (var i = 0; i < buckets.length; i++) {
            count += buckets[i];
            if (count >= halfPoint) {
                median = i;
                break;
            }
        }
        //let sorted = grayscale.slice(0).sort((a, b) => (b > a) ? 1 : (b < a) ? -1 : 0);
        //let medianBySorted = sorted[Math.floor(sorted.length / 2)];
        return median;
    }
    ImageOps.median = median;
    function binaryThresholdNICK(grayscale, width, height, wndSize, k, bufferWidth, bufferHeight) {
        // keep track of the sum and squared sum of the sliding window
        // this implementation is using a separable kernel so it's divided into 
        // an x-pass which just sums up the row in the window followed by an y-pass
        // which takes these partial sums and sums them in the y direction
        //let piSumXPass: Float32Array = new Float32Array(width * height);
        //let piSquaredSumXPass: Float32Array = new Float32Array(width * height);
        // the bufferWidth & bufferHeight is > width & height, but needs to be the same across calls
        // to reuse the same buffer
        var piSumXPass = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        var piSquaredSumXPass = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        piSumXPass.fill(0);
        piSquaredSumXPass.fill(0);
        var halfWndSize = Math.floor(wndSize / 2);
        // doing x-pass and then y-pass is different if the values around the border
        // are taken in account, because x-pass is only done with padding and yet y-pass
        // would take the 0 values from x-pass, compared doing it in 1 go would use the values
        // of the border directly, so removing the border ensures the values are the same as the
        // original slow method without separating the kernels. I don't really care so much about the borders
        // so /ignore
        //removeBorder(halfWndSize, grayscale, width, height);
        var NP = wndSize * wndSize;
        // keep track of index based on padding
        var padding = halfWndSize;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            // instead of calculating the sum of the entire row within the window
            // it can be done more efficiently by only calculating the sum for the first 
            // window and then with each shift of the window to the right subtract the element
            // that falls out of the window and add the element that now falls inside the window
            // for large kernels this means only k + 2 * width operations instead of k * width ops
            var sum = 0;
            var sumSquared = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var val = grayscale[idx + wnd];
                sum += val;
                sumSquared += val * val;
            }
            piSumXPass[idx] = sum;
            piSquaredSumXPass[idx] = sumSquared;
            idx++;
            for (var x = padding + 1; x < width - padding; x++) {
                var remVal = grayscale[idx - 1 - halfWndSize];
                var addVal = grayscale[idx + halfWndSize];
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
        for (var x = padding; x < width - padding; x++) {
            idx = x + padding * width;
            var sum = 0;
            var sumSquared = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var cidx = idx + wnd * width;
                sum += piSumXPass[cidx];
                sumSquared += piSquaredSumXPass[cidx];
            }
            // calculate and apply the threshold at pixel
            {
                var m = sum / NP;
                var A = (sumSquared - (m * m)) / NP;
                var T = m + k * Math.sqrt(A);
                if (grayscale[idx] >= T)
                    grayscale[idx] = 255;
            }
            idx += width;
            var wEdge = halfWndSize * width;
            for (var y = padding + 1; y < height - padding; y++) {
                var cidx = idx - width - wEdge;
                sum -= piSumXPass[cidx];
                sumSquared -= piSquaredSumXPass[cidx];
                cidx = idx + wEdge;
                sum += piSumXPass[cidx];
                sumSquared += piSquaredSumXPass[cidx];
                // now calculate and apply the threshold at each pixel
                {
                    var m = sum / NP;
                    var A = (sumSquared - (m * m)) / NP;
                    var T = m + k * Math.sqrt(A);
                    if (grayscale[idx] >= T)
                        grayscale[idx] = 255;
                }
                idx += width;
            }
        }
        BufferManager.getInstance().releaseFloatBuffer(piSumXPass);
        BufferManager.getInstance().releaseFloatBuffer(piSquaredSumXPass);
    }
    ImageOps.binaryThresholdNICK = binaryThresholdNICK;
    function binaryThresholdNICKCPUCacheOptimized(grayscale, width, height, wndSize, k, bufferWidth, bufferHeight) {
        // keep track of the sum and squared sum of the sliding window
        // this implementation is using a separable kernel so it's divided into 
        // an x-pass which just sums up the row in the window followed by an y-pass
        // which takes these partial sums and sums them in the y direction
        //let piSumXPass: Float32Array = new Float32Array(width * height);
        //let piSquaredSumXPass: Float32Array = new Float32Array(width * height);
        // the bufferWidth & bufferHeight is > width & height, but needs to be the same across calls
        // to reuse the same buffer
        var piSumXPass = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        var piSquaredSumXPass = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        piSumXPass.fill(0);
        piSquaredSumXPass.fill(0);
        var halfWndSize = Math.floor(wndSize / 2);
        // doing x-pass and then y-pass is different if the values around the border
        // are taken in account, because x-pass is only done with padding and yet y-pass
        // would take the 0 values from x-pass, compared doing it in 1 go would use the values
        // of the border directly, so removing the border ensures the values are the same as the
        // original slow method without separating the kernels. I don't really care so much about the borders
        // so /ignore
        //removeBorder(halfWndSize, grayscale, width, height);
        var NP = wndSize * wndSize;
        var transposedWidth = height;
        var transposedHeight = width;
        // keep track of index based on padding
        var padding = halfWndSize;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            // instead of calculating the sum of the entire row within the window
            // it can be done more efficiently by only calculating the sum for the first 
            // window and then with each shift of the window to the right subtract the element
            // that falls out of the window and add the element that now falls inside the window
            // for large kernels this means only k + 2 * width operations instead of k * width ops
            var sum = 0;
            var sumSquared = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var val = grayscale[idx + wnd];
                sum += val;
                sumSquared += val * val;
            }
            var transposeIdx = padding * transposedWidth + y;
            //   console.log("Saving " + padding + "," + y + " (" + idx + ") to " + transposeIdx);
            piSumXPass[transposeIdx] = sum;
            piSquaredSumXPass[transposeIdx] = sumSquared;
            idx++;
            transposeIdx += transposedWidth;
            for (var x = padding + 1; x < width - padding; x++) {
                var remVal = grayscale[idx - 1 - halfWndSize];
                var addVal = grayscale[idx + halfWndSize];
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
        var transposedIdx = padding * transposedWidth + padding;
        for (var transposedY = padding; transposedY < transposedHeight - padding; transposedY++) {
            var sum = 0;
            var sumSquared = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                sum += piSumXPass[transposedIdx + wnd];
                sumSquared += piSquaredSumXPass[transposedIdx + wnd];
            }
            var originalIdx = padding * width + transposedY;
            //  console.log("Using transposed " + padding + "," + transposedY + " (" + transposedIdx + ") to " + originalIdx);
            {
                var m = sum / NP;
                var A = (sumSquared - (m * m)) / NP;
                var T = m + k * Math.sqrt(A);
                //  thresholds[originalIdx] = T;
                if (grayscale[originalIdx] >= T)
                    grayscale[originalIdx] = 255;
            }
            transposedIdx++;
            originalIdx += width;
            for (var transposedX = padding + 1; transposedX < transposedWidth - padding; transposedX++) {
                var cidx = transposedIdx - 1 - halfWndSize;
                sum -= piSumXPass[cidx];
                sumSquared -= piSquaredSumXPass[cidx];
                cidx = transposedIdx + halfWndSize;
                sum += piSumXPass[cidx];
                sumSquared += piSquaredSumXPass[cidx];
                {
                    var m = sum / NP;
                    var A = (sumSquared - (m * m)) / NP;
                    var T = m + k * Math.sqrt(A);
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
    ImageOps.binaryThresholdNICKCPUCacheOptimized = binaryThresholdNICKCPUCacheOptimized;
    function enhanceContrast(grayscale, factor) {
        for (var idx = 0; idx < grayscale.length; idx++) {
            var l = grayscale[idx];
            var val = factor * (l - 128) + 128;
            if (val < 0)
                val = 0;
            if (val > 255)
                val = 255;
            grayscale[idx] = val;
        }
    }
    ImageOps.enhanceContrast = enhanceContrast;
    function stretchHistogram(grayscale, width, height) {
        var max = Number.MIN_VALUE;
        var min = Number.MAX_VALUE;
        for (var i = 0; i < grayscale.length; i++) {
            if (max < grayscale[i])
                max = grayscale[i];
            if (min > grayscale[i])
                min = grayscale[i];
        }
        if (max - min > 0 && max - min < 255) {
            var range = (max - min);
            for (var i = 0; i < grayscale.length; i++) {
                grayscale[i] = (grayscale[i] - min) / range * 255;
            }
        }
    }
    ImageOps.stretchHistogram = stretchHistogram;
})(ImageOps || (ImageOps = {}));
var MorphologicalOps;
(function (MorphologicalOps) {
    function dilate4Fast(grayscale, width, height) {
        // 4x dilate 3x3 = 2x dilate 5x5 = 1x dilate 7x7
        //let xpass: Uint8Array = new Uint8Array(width * height);
        var xpass = BufferManager.getInstance().getUInt8Buffer(width * height);
        var padding = 3;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            var sum = grayscale[idx - 3 - 0] +
                grayscale[idx - 2 - 0] +
                grayscale[idx - 1 - 0] +
                grayscale[idx - 0 - 0] +
                grayscale[idx + 1 - 0] +
                grayscale[idx + 2 - 0] +
                grayscale[idx + 3 - 0];
            xpass[idx] = sum > 0 ? 255 : 0;
            idx++;
            for (var x = padding + 1; x < width - padding; x++) {
                // remove the element that falls out of the range
                sum -= grayscale[idx - 1 - 3 - 0];
                // and add the element that enters the range
                sum += grayscale[idx + 3 - 0];
                xpass[idx] = sum > 0 ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }
        var w3 = width + width + width;
        var w2 = width + width;
        //let dst2: Uint8Array = new Uint8Array(width * height);
        var dst2 = BufferManager.getInstance().getUInt8Buffer(width * height);
        idx = padding * width + padding;
        for (var x = padding; x < width - padding; x++) {
            idx = x + padding * width;
            var sum = xpass[idx - 0 - w3] +
                xpass[idx - 0 - w2] +
                xpass[idx - 0 - width] +
                xpass[idx - 0 - 0] +
                xpass[idx - 0 + width] +
                xpass[idx - 0 + w2] +
                xpass[idx - 0 + w3];
            dst2[idx] = sum > 0 ? 255 : 0;
            idx += width;
            for (var y = padding + 1; y < height - padding; y++) {
                sum -= xpass[idx - width - 0 - w3];
                sum += xpass[idx - 0 + w3];
                dst2[idx] = sum > 0 ? 255 : 0;
                idx += width;
            }
        }
        BufferManager.getInstance().releaseUInt8Buffer(xpass);
        return dst2;
    }
    MorphologicalOps.dilate4Fast = dilate4Fast;
    function erode4Fast(grayscale, width, height) {
        // 4x dilate 3x3 = 2x dilate 5x5 = 1x dilate 7x7
        //let xpass: Uint8ClampedArray = new Uint8ClampedArray(width * height);
        var xpass = BufferManager.getInstance().getUInt8Buffer(width * height);
        var padding = 3;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            var sum = grayscale[idx - 3 - 0] +
                grayscale[idx - 2 - 0] +
                grayscale[idx - 1 - 0] +
                grayscale[idx - 0 - 0] +
                grayscale[idx + 1 - 0] +
                grayscale[idx + 2 - 0] +
                grayscale[idx + 3 - 0];
            xpass[idx] = sum == 7 * 255 ? 255 : 0;
            idx++;
            for (var x = padding + 1; x < width - padding; x++) {
                // remove the element that falls out of the range
                sum -= grayscale[idx - 1 - 3 - 0];
                // and add the element that enters the range
                sum += grayscale[idx + 3 - 0];
                xpass[idx] = sum == 7 * 255 ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }
        var w3 = width + width + width;
        var w2 = width + width;
        //let dst2: Uint8Array = new Uint8Array(width * height);
        var dst2 = BufferManager.getInstance().getUInt8Buffer(width * height);
        idx = padding * width + padding;
        for (var x = padding; x < width - padding; x++) {
            idx = x + padding * width;
            var sum = xpass[idx - 0 - w3] +
                xpass[idx - 0 - w2] +
                xpass[idx - 0 - width] +
                xpass[idx - 0 - 0] +
                xpass[idx - 0 + width] +
                xpass[idx - 0 + w2] +
                xpass[idx - 0 + w3];
            dst2[idx] = sum == 7 * 255 ? 255 : 0;
            idx += width;
            for (var y = padding + 1; y < height - padding; y++) {
                sum -= xpass[idx - width - 0 - w3];
                sum += xpass[idx - 0 + w3];
                dst2[idx] = sum == 7 * 255 ? 255 : 0;
                idx += width;
            }
        }
        BufferManager.getInstance().releaseUInt8Buffer(xpass);
        return dst2;
    }
    MorphologicalOps.erode4Fast = erode4Fast;
    function dilateFast(grayscale, width, height, wndSize, bufferWidth, bufferHeight) {
        var xpass = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        var halfWndSize = Math.floor(wndSize / 2);
        //removeBorder(halfWndSize, grayscale, width, height);
        // keep track of index based on padding
        var padding = halfWndSize;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            var sum = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var val = grayscale[idx + wnd];
                sum += val;
            }
            xpass[idx] = sum > 0 ? 255 : 0;
            idx++;
            for (var x = padding + 1; x < width - padding; x++) {
                var remVal = grayscale[idx - 1 - halfWndSize];
                var addVal = grayscale[idx + halfWndSize];
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
        var dst2 = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);
        for (var x = padding; x < width - padding; x++) {
            idx = x + padding * width;
            var sum = 0;
            var sumSquared = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var cidx = idx + wnd * width;
                sum += xpass[cidx];
            }
            dst2[idx] = sum > 0 ? 255 : 0;
            idx += width;
            var wEdge = halfWndSize * width;
            for (var y = padding + 1; y < height - padding; y++) {
                var cidx = idx - width - wEdge;
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
    MorphologicalOps.dilateFast = dilateFast;
    function erodeFast(grayscale, width, height, wndSize, bufferWidth, bufferHeight) {
        var xpass = BufferManager.getInstance().getFloatBuffer(bufferWidth * bufferHeight);
        var halfWndSize = Math.floor(wndSize / 2);
        // keep track of index based on padding
        var padding = halfWndSize;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            var sum = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var val = grayscale[idx + wnd];
                sum += val;
            }
            xpass[idx] = sum == wndSize * 255 ? 255 : 0;
            idx++;
            for (var x = padding + 1; x < width - padding; x++) {
                var remVal = grayscale[idx - 1 - halfWndSize];
                var addVal = grayscale[idx + halfWndSize];
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
        var dst2 = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);
        for (var x = padding; x < width - padding; x++) {
            idx = x + padding * width;
            var sum = 0;
            var sumSquared = 0;
            for (var wnd = -halfWndSize; wnd <= halfWndSize; wnd++) {
                var cidx = idx + wnd * width;
                sum += xpass[cidx];
            }
            dst2[idx] = sum == wndSize * 255 ? 255 : 0;
            idx += width;
            var wEdge = halfWndSize * width;
            for (var y = padding + 1; y < height - padding; y++) {
                var cidx = idx - width - wEdge;
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
    MorphologicalOps.erodeFast = erodeFast;
    function erode1Fast(grayscale, width, height, bufferWidth, bufferHeight) {
        //let xpass: Uint8ClampedArray = new Uint8ClampedArray(width * height);
        var xpass = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);
        var sumMustBe = 3 * 255;
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            var sum = grayscale[idx - 1] +
                grayscale[idx] +
                grayscale[idx + 1];
            xpass[idx] = sum == sumMustBe ? 255 : 0;
            idx++;
            for (var x = padding + 1; x < width - padding; x++) {
                // remove the element that falls out of the range
                sum -= grayscale[idx - 1 - 1];
                // and add the element that enters the range
                sum += grayscale[idx + 1];
                xpass[idx] = sum == sumMustBe ? 255 : 0;
                idx++;
            }
            idx += 2 * padding;
        }
        var w3 = width + width + width;
        var w2 = width + width;
        //let dst2: Uint8Array = new Uint8Array(width * height);
        var dst2 = BufferManager.getInstance().getUInt8Buffer(bufferWidth * bufferHeight);
        idx = padding * width + padding;
        for (var x = padding; x < width - padding; x++) {
            idx = x + padding * width;
            var sum = xpass[idx - width] +
                xpass[idx] +
                xpass[idx + width];
            dst2[idx] = sum == sumMustBe ? 255 : 0;
            idx += width;
            for (var y = padding + 1; y < height - padding; y++) {
                sum -= xpass[idx - width - width];
                sum += xpass[idx + width];
                dst2[idx] = sum == sumMustBe ? 255 : 0;
                idx += width;
            }
        }
        BufferManager.getInstance().releaseUInt8Buffer(xpass);
        return dst2;
    }
    MorphologicalOps.erode1Fast = erode1Fast;
    function dilate(grayscale, width, height, dst) {
        if (dst === void 0) { dst = null; }
        if (dst == null)
            dst = new Uint8Array(width * height);
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var hasHigh = grayscale[idx - 1 - width] >= 128 ||
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
    MorphologicalOps.dilate = dilate;
    function erode(grayscale, width, height) {
        var dst = BufferManager.getInstance().getUInt8Buffer(width * height);
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var hasLow = 
                //                    grayscale[idx - 1 - width] < 128 ||
                grayscale[idx - 0 - width] < 128 ||
                    //grayscale[idx + 1 - width] < 128 ||
                    grayscale[idx - 1 - 0] < 128 ||
                    grayscale[idx - 0 - 0] < 128 ||
                    grayscale[idx + 1 - 0] < 128 ||
                    //    grayscale[idx - 1 + width] < 128 ||
                    grayscale[idx - 0 + width] < 128; // ||
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
    MorphologicalOps.erode = erode;
})(MorphologicalOps || (MorphologicalOps = {}));
var PerspectiveOps;
(function (PerspectiveOps) {
    // Adapted from https://github.com/paulz/PerspectiveTransform/wiki/Matrix-Math
    function matrixAdjugate(m) {
        return [
            m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
            m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
            m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
        ];
    }
    function matrixMultiply(a, b) {
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
    function multiplyMatrixVector(m, v) {
        return [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
        ];
    }
    function basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
        var m = [
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
    function general2DProjection(x1s, y1s, x1d, y1d, x2s, y2s, x2d, y2d, x3s, y3s, x3d, y3d, x4s, y4s, x4d, y4d) {
        var s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
        var d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
        return matrixMultiply(d, matrixAdjugate(s));
    }
    PerspectiveOps.general2DProjection = general2DProjection;
    function project(m, x, y) {
        var v = multiplyMatrixVector(m, [x, y, 1]);
        return [v[0] / v[2], v[1] / v[2]];
    }
})(PerspectiveOps || (PerspectiveOps = {}));
var ConvolutionOps;
(function (ConvolutionOps) {
    function applyKernel3x3(kernel, grayscale, width, height) {
        var dst = new Uint8Array(width * height);
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = grayscale[idx - 1 - width] * kernel[0] +
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
    ConvolutionOps.applyKernel3x3 = applyKernel3x3;
    function applySeparableKernel3x3(kernelX, kernelY, grayscale, width, height) {
        var dst = new Float32Array(width * height);
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = grayscale[idx - 1 - 0] * kernelX[0] +
                    grayscale[idx - 0 - 0] * kernelX[1] +
                    grayscale[idx + 1 - 0] * kernelX[2];
                dst[idx] = sum;
                idx++;
            }
            idx += 2 * padding;
        }
        var dst2 = new Uint8Array(width * height);
        idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = dst[idx - 0 - width] * kernelY[0] +
                    dst[idx - 0 - 0] * kernelY[1] +
                    dst[idx - 0 + width] * kernelY[2];
                dst2[idx] = sum;
                idx++;
            }
            idx += 2 * padding;
        }
        return dst2;
    }
    ConvolutionOps.applySeparableKernel3x3 = applySeparableKernel3x3;
    function applySeparableKernel5x5(kernelX, kernelY, grayscale, width, height) {
        var xpass = BufferManager.getInstance().getFloatBuffer(width * height);
        var padding = 2;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = grayscale[idx - 2 - 0] * kernelX[0] +
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
        var dst2 = BufferManager.getInstance().getUInt8Buffer(width * height);
        idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = xpass[idx - 0 - width - width] * kernelY[0] +
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
    ConvolutionOps.applySeparableKernel5x5 = applySeparableKernel5x5;
    function applySeparableKernel(kernelX, kernelY, grayscale, width, height) {
        var dst = new Float32Array(width * height);
        var kernHalfWidth = Math.floor(kernelX.length / 2);
        var kernHalfHeight = Math.floor(kernelY.length / 2);
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = 0;
                var kIdx = 0;
                for (var k = -kernHalfWidth; k <= kernHalfWidth; k++) {
                    sum += grayscale[idx + k] * kernelX[kIdx];
                    kIdx++;
                }
                dst[idx] = sum;
                idx++;
            }
            idx += 2 * padding;
        }
        var dst2 = new Uint8Array(width * height);
        idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var sum = 0;
                var lIdx = 0;
                for (var l = -kernHalfHeight; l <= kernHalfHeight; l++) {
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
    ConvolutionOps.applySeparableKernel = applySeparableKernel;
})(ConvolutionOps || (ConvolutionOps = {}));
var Canny;
(function (Canny) {
    function applyCanny(padding, grayscale, width, height, lowThreshold, highThreshold, removeClustersSmallerThan, removeEdgesCloseToDiagonal) {
        //let dst = new Uint8Array(width * height);
        var dst = BufferManager.getInstance().getUInt8Buffer(width * height);
        var magAng = getMagnitudeAndAngle(grayscale, width, height);
        var mags = magAng.magnitude;
        var angs = magAng.angle;
        // check 0,45,90 and 135° angles and only keep the edge pixels that 
        // which magnitude is both higher than the center
        var oct1 = Math.PI / 8;
        var oct3 = 3 * Math.PI / 8;
        var oct5 = 5 * Math.PI / 8;
        var oct7 = 7 * Math.PI / 8;
        var highThresholdSquared = highThreshold * highThreshold;
        var lowThresholdSquared = lowThreshold * lowThreshold;
        var dataIdx = 0;
        for (var j = 0; j < height; j++) {
            for (var i = 0; i < width; i++) {
                var angr = angs[dataIdx];
                if (angr < 0)
                    angr += Math.PI;
                var mag = mags[dataIdx];
                var approxDiagonal = Math.abs(Math.cos(angr)) + Math.abs(Math.sin(angr)) - 1;
                // approxDiagonal will be 1 when it's close to diagonals
                if (removeEdgesCloseToDiagonal) {
                    if (approxDiagonal > 0.25)
                        mag = mag * (1 - approxDiagonal) * (1 - approxDiagonal);
                }
                var magIdx = dataIdx;
                if (angr >= 0 && angr <= oct1 || angr > oct7) {
                    // horizontal
                    var left = mags[(magIdx - 1)];
                    var right = mags[(magIdx + 1)];
                    if (mag > left && mag > right) {
                        dst[dataIdx] = 255;
                    }
                    else
                        dst[dataIdx] = 0;
                }
                else if (angr > oct1 && angr <= oct3) {
                    // 1st diagonal 
                    var leftbottom = mags[(magIdx - 1 + width)];
                    var righttop = mags[(magIdx + 1 - width)];
                    if (mag > leftbottom && mag > righttop)
                        dst[dataIdx] = 255;
                    else
                        dst[dataIdx] = 0;
                }
                else if (angr > oct3 && angr <= oct5) {
                    // vertical
                    var top = mags[(magIdx - width)];
                    var bottom = mags[(magIdx + width)];
                    if (mag > top && mag > bottom)
                        dst[dataIdx] = 255;
                    else
                        dst[dataIdx] = 0;
                }
                else if (angr > oct5 && angr <= oct7) {
                    // 2nd diagonal 
                    var lefttop = mags[(magIdx - 1 - width)];
                    var rightbottom = mags[(magIdx + 1 + width)];
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
        var pointsIdx = [];
        //let visited = new Uint8Array(width * height);
        var visited = BufferManager.getInstance().getUInt8Buffer(width * height);
        visited.fill(0, 0, visited.length);
        dataIdx = padding * width + padding;
        for (var j = padding; j < height - padding; j++) {
            for (var i = padding; i < width - padding; i++) {
                if (dst[dataIdx] > 0) {
                    var currentCluster = [];
                    var isAnyInClusterStrongEdge = false;
                    pointsIdx.push(dataIdx);
                    while (pointsIdx.length > 0) {
                        var pIdx = pointsIdx.pop();
                        if (visited[pIdx] == 0) {
                            visited[pIdx] = 1;
                            var curPointIdx = pIdx;
                            currentCluster.push(curPointIdx);
                            if (dst[curPointIdx] == 255)
                                isAnyInClusterStrongEdge = true;
                            // add all 8 way points around the current point
                            var nextIdx = pIdx - width - 1;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx = pIdx - 1;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx++;
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx = pIdx + width - 1;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                            nextIdx++;
                            if (visited[nextIdx] == 0 && dst[nextIdx] > 0)
                                pointsIdx.push(nextIdx);
                        }
                    }
                    // end of cluster
                    // remove any tiny cluster as well (less than 10px)
                    if (isAnyInClusterStrongEdge && currentCluster.length > removeClustersSmallerThan) {
                        for (var i_1 = 0; i_1 < currentCluster.length; i_1++) {
                            dst[currentCluster[i_1]] = 255;
                        }
                    }
                    else {
                        for (var i_2 = 0; i_2 < currentCluster.length; i_2++) {
                            dst[currentCluster[i_2]] = 0;
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
    Canny.applyCanny = applyCanny;
    function getMagnitudeAndAngle(grayscale, width, height) {
        //let mags = new Float32Array(width * height);
        //let angs = new Float32Array(width * height);
        var mags = BufferManager.getInstance().getFloatBuffer(width * height);
        var angs = BufferManager.getInstance().getFloatBuffer(width * height);
        /*  const sobelX = [
              -1, 0, 1,
              -2, 0, 2,
              -1, 0, 1
          ];*/
        var padding = 1;
        var idx = padding * width + padding;
        for (var y = padding; y < height - padding; y++) {
            for (var x = padding; x < width - padding; x++) {
                var gX2 = 0;
                var gY2 = 0;
                var val = void 0;
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
    function atan2_approximation1(y, x) {
        //http://pubs.opengroup.org/onlinepubs/009695399/functions/atan2.html
        //Volkan SALMA
        var ONEQTR_PI = Math.PI / 4.0;
        var THRQTR_PI = 3.0 * Math.PI / 4.0;
        var r, angle;
        var abs_y = Math.abs(y) + 1e-10; // kludge to prevent 0/0 condition
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
            return (-angle); // negate if in quad III or IV
        else
            return (angle);
    }
})(Canny || (Canny = {}));
function isTheSame(arr1, arr2) {
    for (var i = 0; i < arr1.length; i++) {
        if (arr1[i] != arr2[i]) {
            console.error(i);
            return false;
        }
    }
    return true;
}
function doTime(msg, func, toConsole) {
    if (toConsole === void 0) { toConsole = true; }
    var start = new Date().getTime();
    func();
    var end = new Date().getTime();
    if (toConsole)
        console.log(msg + ": " + (end - start) + "ms");
    return msg + ": " + (end - start) + "ms";
}
GUI.main();
//testNICKThreshold();
function testNICKThreshold() {
    var img = document.getElementById("img");
    var c = document.createElement("canvas");
    var ctx = c.getContext("2d");
    c.width = img.width * 10;
    c.height = img.height * 10;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    var imgData = ctx.getImageData(0, 0, c.width, c.height);
    var grayscale = new Uint8Array(c.width * c.height);
    var grayscale2 = new Uint8Array(c.width * c.height);
    var grayscale3 = new Uint8Array(c.width * c.height);
    for (var i = 0; i < grayscale.length; i++) {
        grayscale[i] = imgData.data[i * 4];
        grayscale2[i] = imgData.data[i * 4];
        grayscale3[i] = imgData.data[i * 4];
    }
    doTime("NICK Threshold", function () {
        ImageOps.binaryThresholdNICK(grayscale, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold", function () {
        ImageOps.binaryThresholdNICK(grayscale2, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold", function () {
        ImageOps.binaryThresholdNICK(grayscale3, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    GUI.saveToCanvas("output", grayscale, c.width, c.height);
    for (var i = 0; i < grayscale.length; i++) {
        grayscale[i] = imgData.data[i * 4];
        grayscale2[i] = imgData.data[i * 4];
        grayscale3[i] = imgData.data[i * 4];
    }
    doTime("NICK Threshold cache", function () {
        ImageOps.binaryThresholdNICKCPUCacheOptimized(grayscale, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold cache", function () {
        ImageOps.binaryThresholdNICKCPUCacheOptimized(grayscale2, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    doTime("NICK Threshold cache", function () {
        ImageOps.binaryThresholdNICKCPUCacheOptimized(grayscale3, c.width, c.height, 19, -0.2, c.width, c.height);
    });
    GUI.saveToCanvas("output", grayscale, c.width, c.height);
    document.getElementById("output").onclick = function (ev) {
        var job = Tesseract.recognize(document.getElementById("output"), {
            lang: 'nld',
        }).progress(function (message) {
            try {
                document.getElementById("barOCR").value = message.progress;
            }
            catch (e) {
            }
        })
            .catch(function (err) { return console.error(err); })
            .then(function (result) { return document.getElementById("txtOutput").textContent = result.text; })
            .finally(function (resultOrError) {
        });
    };
}
//# sourceMappingURL=main.js.map