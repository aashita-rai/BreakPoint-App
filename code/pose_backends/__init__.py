def make_backend(mcfg, cfg, device="cpu"):
    fam = mcfg["family"]
    if fam == "mediapipe":
        from .mediapipe_backend import MediaPipeBackend as B
    elif fam == "yolo":
        from .yolo_backend import YoloBackend as B
    elif fam == "rtmpose":
        from .rtmpose_backend import RTMPoseBackend as B
    elif fam == "vitpose":
        from .vitpose_backend import ViTPoseBackend as B
    elif fam == "movenet":
        from .movenet_backend import MoveNetBackend as B
    else:
        raise ValueError(f"unknown model family: {fam}")
    return B(mcfg, cfg, device)
