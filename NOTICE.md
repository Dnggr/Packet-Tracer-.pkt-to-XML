# Notice

## Not affiliated with Cisco

This project is an independent, unofficial tool. It is **not affiliated with,
endorsed by, or sponsored by Cisco Systems, Inc.** "Cisco" and "Cisco Packet
Tracer" are trademarks or registered trademarks of Cisco Systems, Inc. and its
affiliates. They are used here only to describe the file format this tool
reads. It is intended for converting your own files and for use within your
institution's rules.

## Third-party software: pka2xml

The conversion algorithm in `src/converter/` (the deobfuscation stages, the
Twofish-EAX decryption parameters, and the Qt-style decompression framing) is
derived from **pka2xml** by Mirco De Zorzi: <https://github.com/mircodz/pka2xml>
(reference commit `22fee2681779a6dd764d6562b0a134ceb339e770`).

pka2xml is distributed under the BSD 2-Clause License, reproduced below as
required by that license.

```
BSD 2-Clause License

Copyright (c) 2020, Mirco De Zorzi
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

This project's own code is licensed separately under the MIT License (see
`LICENSE`).
