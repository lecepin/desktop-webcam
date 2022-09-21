// const { dialog } = window.__TAURI__;
// const { LogicalPosition, LogicalSize, getCurrent, appWindow } =
//   window.__TAURI__.window;
const RUNTIME_CONF = {
  fps: true,
  fps_dom: null,
  face: false,
  beauty: false,
};
const utils = new Utils();

// fps
{
  // todo: 快捷键打开
  const stats = new Stats();
  const loop = function loop() {
    if (RUNTIME_CONF.fps && !RUNTIME_CONF.fps_dom) {
      document.body.appendChild(stats.dom);
      RUNTIME_CONF.fps_dom = stats.dom;
    } else if (!RUNTIME_CONF.fps && RUNTIME_CONF.fps_dom) {
      document.body.removeChild(stats.dom);
      RUNTIME_CONF.fps_dom = null;
    }

    RUNTIME_CONF.fps && stats.update();
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

// opencv
{
  window.Module = {
    onRuntimeInitialized() {
      let videoInput = document.getElementById("cam-video");

      utils.createFileFromUrl(
        "haarcascade_frontalface_default.xml",
        "./assets/haarcascade_frontalface_default.xml",
        () => {
          navigator.mediaDevices
            .getUserMedia({
              // video: { width: { exact: 320 }, height: { exact: 240 } },
              video: true,
              audio: false,
            })
            .then(function (stream) {
              videoInput.srcObject = stream;
              videoInput.play();
              videoInput.addEventListener("canplay", onVideoCanPlay, false);
            })
            .catch(async (err) => {
              await dialog.message("本应用需要摄像头授权，否则无法使用", {
                title: "授权失败",
                type: "error",
              });
              appWindow.close();
            });
          const onVideoCanPlay = () => {
            videoInput.width = videoInput.videoWidth;
            videoInput.height = videoInput.videoHeight;

            let src = new cv.Mat(
              videoInput.height,
              videoInput.width,
              cv.CV_8UC4
            );
            let dst = new cv.Mat(
              videoInput.height,
              videoInput.width,
              cv.CV_8UC4
            );
            let gray = new cv.Mat();
            let faceVect = new cv.RectVector();
            let faceMat = new cv.Mat();
            let cap = new cv.VideoCapture(videoInput);
            let [roiPoint1, roiPoint2] = [
              { x: 0, y: 0 },
              {
                x: videoInput.width,
                y: videoInput.height,
              },
            ];
            const faceClassifier = new cv.CascadeClassifier();
            const FACE_PADDING_THRESHOLD = 0.1;
            const FACE_SHAKE_FILTER_SIZE = 40;
            const FACE_SHAKE_FILTER_LIST = [];

            faceClassifier.load("haarcascade_frontalface_default.xml");
            requestAnimationFrame(processVideo);

            function face_padding(p1, p2, w, h) {
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
            }

            function shakeFilter(p1, p2) {
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
            }

            function processVideo() {
              try {
                cap.read(src);
                src.copyTo(dst);

                if (RUNTIME_CONF.face) {
                  cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);
                  cv.pyrDown(gray, faceMat);
                  cv.pyrDown(faceMat, faceMat);
                  faceClassifier.detectMultiScale(faceMat, faceVect, 1.1, 3, 0);

                  for (let i = 0; i < faceVect.size(); ++i) {
                    let face = faceVect.get(i);
                    let xRatio = videoInput.width / faceMat.size().width;
                    let yRatio = videoInput.height / faceMat.size().height;

                    // 扩大人脸范围
                    [roiPoint1, roiPoint2] = face_padding(
                      {
                        x: face.x * xRatio,
                        y: face.y * yRatio,
                      },
                      {
                        x: face.width * xRatio,
                        y: face.height * yRatio,
                      },
                      videoInput.width,
                      videoInput.height
                    );

                    // todo: 框选

                    break;
                  }

                  dst = dst.roi(
                    new cv.Rect(
                      ...shakeFilter(
                        { x: roiPoint1.x, y: roiPoint1.y },
                        { x: roiPoint2.x, y: roiPoint2.y }
                      )
                    )
                  );
                }

                if (RUNTIME_CONF.beauty) {
                  let _dst = new cv.Mat();

                  cv.cvtColor(dst, _dst, cv.COLOR_RGBA2RGB);
                  cv.bilateralFilter(_dst, dst, 4, 100, 10, 4);
                  _dst.delete();
                }

                cv.imshow("outputCanvas", dst);
                requestAnimationFrame(processVideo);
              } catch (err) {
                utils.printError(err);
              }
            }
          };
        }
      );
    },
  };
}

// btn handle
{
  const canvasEl = document.getElementById("outputCanvas");

  document.querySelector(".btn-close").onclick = () => {
    appWindow.close();
  };

  document.querySelector(".btn-mirror").onclick = ({ currentTarget }) => {
    if (canvasEl.classList.contains("cam-video-revert")) {
      canvasEl.classList.remove("cam-video-revert");
      currentTarget.classList.add("btn-selected");
    } else {
      canvasEl.classList.add("cam-video-revert");
      currentTarget.classList.remove("btn-selected");
    }
  };

  document.querySelector(".btn-face").onclick = ({ currentTarget }) => {
    RUNTIME_CONF.face = !RUNTIME_CONF.face;

    if (RUNTIME_CONF.face) {
      currentTarget.classList.add("btn-selected");
    } else {
      currentTarget.classList.remove("btn-selected");
    }
  };

  document.querySelector(".btn-beauty").onclick = ({ currentTarget }) => {
    RUNTIME_CONF.beauty = !RUNTIME_CONF.beauty;

    if (RUNTIME_CONF.beauty) {
      currentTarget.classList.add("btn-selected");
      canvasEl.style.filter = "brightness(110%)";
    } else {
      currentTarget.classList.remove("btn-selected");
      canvasEl.style.filter = "";
    }
  };
}

// circle btn show event
{
  document
    .getElementById("detect-show-area")
    .addEventListener("mouseover", () => {
      document.querySelectorAll("[data-btn]").forEach((btn) => {
        btn.classList.remove("hide-circle-btn");
      });
    });
  document
    .getElementById("detect-show-area")
    .addEventListener("mouseout", () => {
      document.querySelectorAll("[data-btn]").forEach((btn) => {
        btn.classList.add("hide-circle-btn");
      });
    });
}

// change window size btn
{
  const sizeValue = {
    small: 195,
    middle: 330,
    large: 580,
  };
  let size = "middle";

  document
    .querySelector(".btn-change-size-" + size)
    .classList.add("btn-change-size-select");
  document.querySelector(".btn-change-size").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-change-size-small")) {
      size = "small";
    } else if (e.target.classList.contains("btn-change-size-middle")) {
      size = "middle";
    } else if (e.target.classList.contains("btn-change-size-large")) {
      size = "large";
    }

    document.querySelectorAll(".btn-change-size-btn").forEach((btn) => {
      btn.classList.remove("btn-change-size-select");
    });
    document
      .querySelector(".btn-change-size-" + size)
      .classList.add("btn-change-size-select");

    appWindow.setSize(new LogicalSize(sizeValue[size], sizeValue[size]));
  });
}
