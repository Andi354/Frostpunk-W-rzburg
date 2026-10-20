// Imports every sim module that registers hourly systems, in the order they run.
// Order: economy (C), people (D), research (E), laws (F), explore (G), story (I).
import './economy';
import './research';
import './people';
import './laws';
import './explore';
