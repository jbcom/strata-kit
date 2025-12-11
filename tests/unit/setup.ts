/**
 * Unit test setup file
 *
 * Mocks WebGL and DOM APIs for tests that don't need real rendering
 */

// Mock WebGL context for Three.js
if (typeof document !== 'undefined') {
    // Create a minimal WebGL mock (always use mock in test environment)
    const mockGL = {
        getParameter: (param: number) => {
            // VERSION should return a string
            if (param === 0x1f02) return 'WebGL 1.0 (Mock)'; // VERSION
            if (param === 0x8b8c) return 'Mock Vendor'; // SHADING_LANGUAGE_VERSION
            if (param === 0x1f00) return 'Mock Vendor'; // VENDOR
            if (param === 0x1f01) return 'Mock Renderer'; // RENDERER
            return 0;
        },
            getExtension: () => null,
            createShader: () => ({}),
            shaderSource: () => {},
            compileShader: () => {},
            getShaderParameter: () => true,
            createProgram: () => ({}),
            attachShader: () => {},
            linkProgram: () => {},
            getProgramParameter: () => true,
            useProgram: () => {},
            createBuffer: () => ({}),
            bindBuffer: () => {},
            bufferData: () => {},
            enableVertexAttribArray: () => {},
            vertexAttribPointer: () => {},
            drawArrays: () => {},
            viewport: () => {},
            clearColor: () => {},
            clear: () => {},
            getUniformLocation: () => ({}),
            uniform1f: () => {},
            uniform2f: () => {},
            uniform3f: () => {},
            uniform4f: () => {},
            uniformMatrix4fv: () => {},
            activeTexture: () => {},
            bindTexture: () => {},
            texImage2D: () => {},
            texParameteri: () => {},
            generateMipmap: () => {},
            pixelStorei: () => {},
            createTexture: () => ({}),
            deleteTexture: () => {},
            deleteShader: () => {},
            deleteProgram: () => {},
            deleteBuffer: () => {},
            FRAGMENT_SHADER: 35632,
            VERTEX_SHADER: 35633,
            ARRAY_BUFFER: 34962,
            ELEMENT_ARRAY_BUFFER: 34963,
            STATIC_DRAW: 35044,
            TRIANGLES: 4,
            TEXTURE_2D: 3553,
            TEXTURE_WRAP_S: 10242,
            TEXTURE_WRAP_T: 10243,
            TEXTURE_MIN_FILTER: 10241,
            TEXTURE_MAG_FILTER: 10240,
            REPEAT: 10497,
            LINEAR: 9729,
            LINEAR_MIPMAP_LINEAR: 9987,
            RGBA: 6408,
            UNSIGNED_BYTE: 5121,
            COLOR_BUFFER_BIT: 16384,
            DEPTH_BUFFER_BIT: 256,
            DEPTH_TEST: 2929,
            LEQUAL: 515,
            DEPTH_COMPONENT: 6402,
            TEXTURE0: 33984,
            UNPACK_FLIP_Y_WEBGL: 37440,
        };

        // Mock 2D context for canvas operations
        const mock2D = {
            fillRect: () => {},
            clearRect: () => {},
            getImageData: () => ({ data: new Uint8ClampedArray(4) }),
            putImageData: () => {},
            createImageData: () => ({ data: new Uint8ClampedArray(4) }),
            setTransform: () => {},
            drawImage: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            closePath: () => {},
            stroke: () => {},
            fill: () => {},
            translate: () => {},
            scale: () => {},
            rotate: () => {},
            arc: () => {},
            measureText: () => ({ width: 0 }),
            fillText: () => {},
            strokeText: () => {},
            createLinearGradient: () => ({
                addColorStop: () => {},
            }),
            createRadialGradient: () => ({
                addColorStop: () => {},
            }),
            createPattern: () => ({}),
            canvas: { width: 300, height: 150 },
        };

        // Override getContext to return mocks
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (contextType: string) {
            if (contextType === 'webgl' || contextType === 'webgl2') {
                return mockGL as unknown as WebGLRenderingContext;
            }
            if (contextType === '2d') {
                return mock2D as unknown as CanvasRenderingContext2D;
            }
            return originalGetContext.call(this, contextType);
        };
}
