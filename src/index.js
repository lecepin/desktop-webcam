/**
 * @author  lecepin
 * @github  https://github.com/lecepin
 */
const { dialog } = window.__TAURI__;
const { LogicalPosition, LogicalSize, getCurrent, appWindow } =
  window.__TAURI__.window;
const RUNTIME_CONF = {
  fps: false,
  fps_dom: null,
  face: false,
  beauty: false,
};
const utils = new Utils();
const videoInput = document.getElementById("cam-video");

// fps
{
  const stats = new Stats();
  const loop = function loop() {
    if (RUNTIME_CONF.fps) {
      if (!RUNTIME_CONF.fps_dom) {
        document.body.appendChild(stats.dom);
        RUNTIME_CONF.fps_dom = stats.dom;
      }
      RUNTIME_CONF.fps_dom.style.display = "block";
    } else if (!RUNTIME_CONF.fps) {
      if (RUNTIME_CONF.fps_dom) {
        RUNTIME_CONF.fps_dom.style.display = "none";
      }
    }

    RUNTIME_CONF.fps && stats.update();
    requestAnimationFrame(loop);
  };

  loop();
  document.addEventListener("keydown", (e) => {
    // cmd + f
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 70) {
      e.preventDefault();
      RUNTIME_CONF.fps = !RUNTIME_CONF.fps;
    }
  });
}

// opencv
{
  utils.loadOpenCv(() => {
    utils.createFileFromUrl(
      "haarcascade_frontalface_default.xml",
      "./assets/haarcascade_frontalface_default.xml",
      () => {
        utils.startCamera("", onVideoStarted, "cam-video", async () => {
          await dialog.message("本应用需要摄像头授权，否则无法使用", {
            title: "授权失败",
            type: "error",
          });
          appWindow.close();
        });
      }
    );
  });

  function onVideoStarted() {
    videoInput.width = videoInput.videoWidth;
    videoInput.height = videoInput.videoHeight;

    let src = new cv.Mat(videoInput.height, videoInput.width, cv.CV_8UC4);
    let dst = new cv.Mat(videoInput.height, videoInput.width, cv.CV_8UC4);
    let gray = new cv.Mat();
    let cap = new cv.VideoCapture(videoInput);
    let faces = new cv.RectVector();
    let classifier = new cv.CascadeClassifier();
    let [roiPoint1, roiPoint2] = [
      { x: 0, y: 0 },
      {
        x: videoInput.width,
        y: videoInput.height,
      },
    ];

    classifier.load("haarcascade_frontalface_default.xml");

    const FPS = 30;
    function processVideo() {
      try {
        let begin = Date.now();

        cap.read(src);
        src.copyTo(dst);

        let renderMat = dst;

        if (RUNTIME_CONF.face) {
          cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);
          cv.pyrDown(gray, gray);
          cv.pyrDown(gray, gray);
          classifier.detectMultiScale(gray, faces, 1.1, 3, 0);

          let face = faces.get(0);

          if (face) {
            let xRatio = videoInput.width / gray.size().width;
            let yRatio = videoInput.height / gray.size().height;

            // 扩大人脸范围
            [roiPoint1, roiPoint2] = utils.face_padding(
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
          }

          renderMat = dst.roi(
            new cv.Rect(
              ...utils.shakeFilter(
                { x: roiPoint1.x, y: roiPoint1.y },
                { x: roiPoint2.x, y: roiPoint2.y }
              )
            )
          );
        }

        if (RUNTIME_CONF.beauty) {
          renderMat = utils.beauty(renderMat);
        }

        cv.imshow("canvasOutput", renderMat);

        let delay = 1000 / FPS - (Date.now() - begin);
        setTimeout(processVideo, delay);
      } catch (err) {
        utils.printError(err);
      }
    }

    setTimeout(processVideo, 0);
  }
}

// btn handle
{
  const canvasEl = document.getElementById("canvasOutput");

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
