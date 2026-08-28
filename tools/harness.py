"""What the two test harnesses need from the machine they run on.

Playwright normally drives a browser build it downloads itself - about 130 MB per engine, kept
outside this repository. That build is the right thing when it is there: it is pinned, so a number
measured today can be compared with a number measured in six months.

It is not always there. A fresh environment has the `playwright` package and no browsers, and
downloading one is a decision about somebody's disk rather than a thing a test script should do on
its own. Most machines that run this already have Chrome or Edge installed, and for what these
harnesses ask - does the cabinet boot, is there paint on the canvas, does the car reach 150mph -
an installed Chrome answers exactly as well.

▶ THE BROWSER THAT WAS USED IS PRINTED, ALWAYS. A harness that silently changed which engine it
measured would be a harness whose numbers cannot be compared between two runs, and the first
symptom would be a performance figure that moved for no reason anybody could find.

To pin the browser instead: `python -m playwright install chromium`.
"""

CHANNELS = ("chrome", "msedge")


def launch_chromium(p, **kw):
    """Playwright's own build first, then an installed Chrome or Edge. Says which it got."""
    try:
        browser = p.chromium.launch(**kw)
        print("  browser: playwright bundled chromium (pinned)")
        return browser
    except Exception as bundled_failed:
        for channel in CHANNELS:
            try:
                browser = p.chromium.launch(channel=channel, **kw)
                print(f"  browser: installed {channel} - no bundled chromium, so the engine "
                      f"version is whatever this machine has")
                return browser
            except Exception:
                continue
        raise bundled_failed


def node_exe():
    """The node executable, by whatever name this machine has it under.

    THE HARNESSES SHELL OUT TO NODE to read `games.js`, because the catalogue is JavaScript and
    the alternative is a second parser that can disagree with the launcher. On Windows the name
    is the problem: `subprocess` calls CreateProcess directly, which does not apply PATHEXT, so a
    bare "node" misses `node.cmd` and `node.exe` and fails with "The system cannot find the file
    specified" - a message that names neither node nor PATH.
    """
    import shutil
    for name in ("node", "node.exe", "node.cmd", "node.bat"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit(
        "[harness] node is not on PATH, and the catalogue is read with it.\n"
        "          Install Node, or run the environment's shim installer.")


def console_utf8():
    """Make this console take the characters the harnesses print.

    THE REPORTS ARE FULL OF THEM - a middle dot between fields, an arrow between HUD states, an
    approximation sign in front of a measured average. On Windows the console is cp1252 by default,
    and printing one of those raises `UnicodeEncodeError` INSIDE the report, AFTER every check has
    already run and passed. The result is a harness that does the work, throws the answer away, and
    exits non-zero - which reads as a failing test suite rather than as a broken printer.
    """
    import sys
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass
