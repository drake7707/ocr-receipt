# Javascript only OCR Receipt

Rectifies receipts from video feed and OCR's them with Tesseract JS. It's completely client side and makes use of HTML5 apis such as getUserMedia to access the webcam / phone's camera.

The various image operations have been highly optimized so it has acceptable performance on low power phones.

## Try it out

https://drake7707.github.io/ocr-receipt/

Due to the use of Canny and automatic threshold selection (and a wide variety of cameras and exposures) it's best to try it out in a well lit area with a darker plain background so the contrast is clear and the edges are properly detected without too much noise.

High resolution preview applies the warp perspective and thresholding on the full HD image, which might be slow on your phone but will show a better resolution output. Running the OCR is done on the high res image anyway so it only matters for the preview.

## Algorithm

1.  Grayscale

2. Enhance contrast

3. Canny 

4. Morphologic close (dilate & erode) 

5. Trace contours 

6. Find best rectangular area

7. Find the 4 corners of rectangular-ish polygon 

8. Warp perspective to correct it 

9. Apply NICK thresholding to have better results with tesseract OCR

10. Do the OCR (only done after clicking/tapping the output because it's not real time)

Everything except the OCR process with Tesseract JS has been implemented by myself to have fine grained control and reduce any overhead

## Screenshot

![](https://i.imgur.com/QheJySX.png)
