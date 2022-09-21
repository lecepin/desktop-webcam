function Utils() {
  // eslint-disable-line no-unused-vars
  let self = this;

  const OPENCV_URL = "opencv.js";
  const FACE_PADDING_THRESHOLD = 0.1;
  const FACE_SHAKE_FILTER_SIZE = 40;
  const FACE_SHAKE_FILTER_LIST = [];

  this.loadOpenCv = function (onloadCallback) {
    let script = document.createElement("script");
    script.setAttribute("async", "");
    script.setAttribute("type", "text/javascript");
    script.addEventListener("load", async () => {
      if (cv.getBuildInformation) {
        console.log(cv.getBuildInformation());
        onloadCallback();
      } else {
        // WASM
        if (cv instanceof Promise) {
          cv = await cv;
          console.log(cv.getBuildInformation());
          onloadCallback();
        } else {
          cv["onRuntimeInitialized"] = () => {
            console.log(cv.getBuildInformation());
            onloadCallback();
          };
        }
      }
    });
    script.addEventListener("error", () => {
      self.printError("Failed to load " + OPENCV_URL);
    });
    script.src = OPENCV_URL;
    let node = document.getElementsByTagName("script")[0];
    node.parentNode.insertBefore(script, node);
  };

  this.createFileFromUrl = function (path, url, callback) {
    let request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = function (ev) {
      if (request.readyState === 4) {
        if (request.status === 200) {
          let data = new Uint8Array(request.response);
          cv.FS_createDataFile("/", path, data, true, false, false);
          callback();
        } else {
          self.printError(
            "Failed to load " + url + " status: " + request.status
          );
        }
      }
    };
    request.send();
  };

  this.loadImageToCanvas = function (url, cavansId) {
    let canvas = document.getElementById(cavansId);
    let ctx = canvas.getContext("2d");
    let img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);
    };
    img.src = url;
  };

  this.executeCode = function (textAreaId) {
    try {
      this.clearError();
      let code = document.getElementById(textAreaId).value;
      eval(code);
    } catch (err) {
      this.printError(err);
    }
  };

  this.printError = function (err) {
    if (typeof err === "undefined") {
      err = "";
    } else if (typeof err === "number") {
      if (!isNaN(err)) {
        if (typeof cv !== "undefined") {
          err = "Exception: " + cv.exceptionFromPtr(err).msg;
        }
      }
    } else if (typeof err === "string") {
      let ptr = Number(err.split(" ")[0]);
      if (!isNaN(ptr)) {
        if (typeof cv !== "undefined") {
          err = "Exception: " + cv.exceptionFromPtr(ptr).msg;
        }
      }
    } else if (err instanceof Error) {
      err = err.stack.replace(/\n/g, "<br>");
    }
    console.error(err);
  };

  this.loadCode = function (scriptId, textAreaId) {
    let scriptNode = document.getElementById(scriptId);
    let textArea = document.getElementById(textAreaId);
    if (scriptNode.type !== "text/code-snippet") {
      throw Error("Unknown code snippet type");
    }
    textArea.value = scriptNode.text.replace(/^\n/, "");
  };

  this.addFileInputHandler = function (fileInputId, canvasId) {
    let inputElement = document.getElementById(fileInputId);
    inputElement.addEventListener(
      "change",
      (e) => {
        let files = e.target.files;
        if (files.length > 0) {
          let imgUrl = URL.createObjectURL(files[0]);
          self.loadImageToCanvas(imgUrl, canvasId);
        }
      },
      false
    );
  };

  function onVideoCanPlay() {
    if (self.onCameraStartedCallback) {
      self.onCameraStartedCallback(self.stream, self.video);
    }
  }

  this.startCamera = function (resolution, callback, videoId, errorCallback) {
    const constraints = {
      qvga: { width: { exact: 320 }, height: { exact: 240 } },
      vga: { width: { exact: 640 }, height: { exact: 480 } },
    };
    let video = document.getElementById(videoId);
    if (!video) {
      video = document.createElement("video");
    }

    let videoConstraint = constraints[resolution];
    if (!videoConstraint) {
      videoConstraint = true;
    }

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraint, audio: false })
      .then(function (stream) {
        video.srcObject = stream;
        video.play();
        self.video = video;
        self.stream = stream;
        self.onCameraStartedCallback = callback;
        video.addEventListener("canplay", onVideoCanPlay, false);
      })
      .catch(function (err) {
        self.printError("Camera Error: " + err.name + " " + err.message);
        if (errorCallback) {
          errorCallback(err);
        }
      });
  };

  this.stopCamera = function () {
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.removeEventListener("canplay", onVideoCanPlay);
    }
    if (this.stream) {
      this.stream.getVideoTracks()[0].stop();
    }
  };

  this.face_padding = function (p1, p2, w, h) {
    const padding = Math.min(w, h) * FACE_PADDING_THRESHOLD;
    const _p1 = {
      x: Math.max(p1.x - padding, 0),
      y: Math.max(p1.y - padding, 0),
    };
    const _p2 = {
      x: Math.min(p2.x + 2 * padding, w - p1.x),
      y: Math.min(p2.y + 2 * padding, h - p1.y),
    };
    const _center = {
      x: _p1.x + _p2.x / 2,
      y: _p1.y + _p2.y / 2,
    };
    const _r = Math.min(_p2.x, _p2.y) / 2;

    // 正方形
    return [
      { x: _center.x - _r, y: _center.y - _r },
      { x: 2 * _r, y: 2 * _r },
    ];
  };

  this.shakeFilter = function (p1, p2) {
    if (FACE_SHAKE_FILTER_LIST.length >= FACE_SHAKE_FILTER_SIZE) {
      FACE_SHAKE_FILTER_LIST.shift();
      FACE_SHAKE_FILTER_LIST.push({ p1, p2 });
    } else {
      FACE_SHAKE_FILTER_LIST.push({ p1, p2 });
    }

    const sum_point = FACE_SHAKE_FILTER_LIST.reduce(
      (prev, curr) => {
        return {
          p1: { x: prev.p1.x + curr.p1.x, y: prev.p1.y + curr.p1.y },
          p2: { x: prev.p2.x + curr.p2.x, y: prev.p2.y + curr.p2.y },
        };
      },
      { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } }
    );

    return [
      sum_point.p1.x / FACE_SHAKE_FILTER_LIST.length,
      sum_point.p1.y / FACE_SHAKE_FILTER_LIST.length,
      sum_point.p2.x / FACE_SHAKE_FILTER_LIST.length,
      sum_point.p2.y / FACE_SHAKE_FILTER_LIST.length,
    ];
  };

  this.beauty = function (dst) {
    let _dst = new cv.Mat();
    let _dst2 = new cv.Mat();

    cv.cvtColor(dst, _dst, cv.COLOR_RGBA2RGB);
    cv.bilateralFilter(_dst, _dst2, 4, 100, 10, 4);
    _dst.delete();

    return _dst2;
  };
}
