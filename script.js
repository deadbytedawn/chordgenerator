
    // --- Audio Setup ---
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    // --- Music Data Maps ---
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Scale intervals (semitones from root) and roman numerals for mapping
    const SCALES = {
        major: {
            intervals: [0, 2, 4, 5, 7, 9, 11],
            chordTypes: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
            labels: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            // Common formulas using scale degrees (0-indexed)
            progressions: [[0, 4, 5, 3], [0, 5, 1, 4], [0, 3, 0, 4], [5, 3, 0, 4]] 
        },
        minor: {
            intervals: [0, 2, 3, 5, 7, 8, 10],
            chordTypes: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
            labels: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
            progressions: [[0, 5, 2, 6], [0, 3, 6, 5], [0, 6, 5, 4], [4, 5, 6, 0]]
        }
    };

    // Semitones relative to root for chord triads
    const CHORD_BUFFERS = {
        maj: [0, 4, 7],
        min: [0, 3, 7],
        dim: [0, 3, 6]
    };

    // --- State Variables ---
    let currentProgression = []; // Holds objects: { name: 'Am', midiNotes: [...] }
    let isPlaying = false;
    let playbackTimeout = null;

    // --- UI Elements ---
    const generateBtn = document.getElementById('generateBtn');
    const playBtn = document.getElementById('playBtn');
    const exportBtn = document.getElementById('exportBtn');
    const progressionDisplay = document.getElementById('progressionDisplay');

    // --- Event Listeners ---
    generateBtn.addEventListener('click', generateProgression);
    playBtn.addEventListener('click', togglePlayback);
    exportBtn.addEventListener('click', exportMIDI);

    // --- Core Logic ---

    function getMidiNote(name, octave) {
        return NOTE_NAMES.indexOf(name) + (octave + 1) * 12;
    }

    function generateProgression() {
        stopPlayback();
        
        const rootKey = document.getElementById('keySelect').value;
        const scaleType = document.getElementById('scaleSelect').value;
        
        const scale = SCALES[scaleType];
        const rootMidi = getMidiNote(rootKey, 4); // Target middle octave

        // Pick a random built-in formula
        const formula = scale.progressions[Math.floor(Math.random() * scale.progressions.length)];
        
        currentProgression = formula.map(degree => {
            const scaleInterval = scale.intervals[degree];
            const chordType = scale.chordTypes[degree];
            
            // Calculate base note name for display
            const chordRootMidi = rootMidi + scaleInterval;
            const chordRootName = NOTE_NAMES[chordRootMidi % 12];
            
            // Build the actual MIDI notes for the triad (spread across octaves for nice voicing)
            const triadIntervals = CHORD_BUFFERS[chordType];
            const midiNotes = [
                chordRootMidi,                  // Root
                chordRootMidi + triadIntervals[1], // 3rd
                chordRootMidi + triadIntervals[2], // 5th
                chordRootMidi - 12              // Bass note reinforcement
            ];

            // Clean up suffix for display
            let displayType = chordType === 'maj' ? '' : (chordType === 'min' ? 'm' : 'dim');

            return {
                name: chordRootName + displayType,
                midiNotes: midiNotes
            };
        });

        // Update UI
        progressionDisplay.innerHTML = '';
        currentProgression.forEach((chord, idx) => {
            const div = document.createElement('div');
            div.className = 'chord-card';
            div.id = `chord-${idx}`;
            div.textContent = chord.name;
            progressionDisplay.appendChild(div);
        });

        playBtn.disabled = false;
        exportBtn.disabled = false;
    }

    // --- Audio Synthesis Engine ---

    function playTone(midiNote, startTime, duration) {
        if (!audioCtx) audioCtx = new AudioContext();
        
        // Convert MIDI note to Frequency
        const freq = Math.pow(2, (midiNote - 69) / 12) * 440;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // Polyphonic synth texture (Warm triangle wave)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        // Standard ADSR Envelope to prevent clicking
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.05); // Attack
        gainNode.gain.setValueAtTime(0.2, startTime + duration - 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    function togglePlayback() {
        if (isPlaying) {
            stopPlayback();
        } else {
            startPlayback();
        }
    }

    function startPlayback() {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        isPlaying = true;
        playBtn.textContent = '⏹️ Stop Demo';
        
        const bpm = parseInt(document.getElementById('tempoSelect').value);
        const beatDuration = 60 / bpm;
        const chordDuration = beatDuration * 2; // Each chord gets 2 beats
        
        let now = audioCtx.currentTime;

        currentProgression.forEach((chord, idx) => {
            const chordStartTime = now + (idx * chordDuration);
            
            // Trigger UI highlighting synchronized with audio
            playbackTimeout = setTimeout(() => {
                document.querySelectorAll('.chord-card').forEach(c => c.classList.remove('active'));
                const card = document.getElementById(`chord-${idx}`);
                if (card) card.classList.add('active');
            }, (idx * chordDuration) * 1000);

            // Play notes polyphonically
            chord.midiNotes.forEach(note => {
                playTone(note, chordStartTime, chordDuration - 0.05);
            });
        });

        // Reset UI when playback naturally finishes
        playbackTimeout = setTimeout(stopPlayback, (currentProgression.length * chordDuration) * 1000);
    }

    function stopPlayback() {
        isPlaying = false;
        playBtn.textContent = '▶️ Play Demo';
        clearTimeout(playbackTimeout);
        document.querySelectorAll('.chord-card').forEach(c => c.classList.remove('active'));
    }

    // --- Pure JavaScript MIDI File Generation ---
    // Generates a minimal compliant Format 0 MIDI file from scratch byte-by-byte
    function exportMIDI() {
        if (currentProgression.length === 0) return;

        const bpm = parseInt(document.getElementById('tempoSelect').value);
        
        // Header Chunk: 'MThd' + chunk len (6) + format (0) + tracks (1) + division (96 ticks per beat)
        const header = [
            0x4d, 0x54, 0x68, 0x64, 
            0x00, 0x00, 0x00, 0x06, 
            0x00, 0x00, 0x00, 0x01, 
            0x00, 0x60 
        ];

        let trackEvents = [];

        // Set Tempo Meta-Event: FF 51 03 [3 bytes microseconds per quarter note]
        const microSecondsPerBeat = Math.round(60000000 / bpm);
        const mt1 = (microSecondsPerBeat >> 16) & 0xFF;
        const mt2 = (microSecondsPerBeat >> 8) & 0xFF;
        const mt3 = microSecondsPerBeat & 0xFF;
        trackEvents.push(0x00, 0xFF, 0x51, 0x03, mt1, mt2, mt3);

        const ticksPerChord = 192; // 2 beats * 96 ticks per beat

        // Write Chords sequentially
        currentProgression.forEach((chord) => {
            // 1. Turn all notes in the chord ON simultaneously (Delta time = 0 for subsequent notes)
            chord.midiNotes.forEach((note, index) => {
                const deltaTime = index === 0 ? 0x00 : 0x00; 
                trackEvents.push(deltaTime, 0x90, note, 0x40); // 0x90 = Note On, 0x40 = Velocity
            });

            // 2. Turn all notes OFF after the duration has elapsed
            chord.midiNotes.forEach((note, index) => {
                // The first Note Off happens after ticksPerChord. 
                // The rest happen instantly (delta time 0) right after it.
                const deltaTime = index === 0 ? ticksPerChord : 0x00;
                trackEvents.push(deltaTime, 0x80, note, 0x00); // 0x80 = Note Off
            });
        });

        // End of Track Meta-Event
        trackEvents.push(0x00, 0xFF, 0x2F, 0x00);

        // Track Chunk: 'MTrk' + track length + track events
        const trackLength = trackEvents.length;
        const trackHeader = [
            0x4d, 0x54, 0x72, 0x6b,
            (trackLength >> 24) & 0xFF,
            (trackLength >> 16) & 0xFF,
            (trackLength >> 8) & 0xFF,
            trackLength & 0xFF
        ];

        const midiBytes = new Uint8Array([...header, ...trackHeader, ...trackEvents]);
        
        // Trigger safe browser download
        const blob = new Blob([midiBytes], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `progression_${bpm}bpm.mid`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }