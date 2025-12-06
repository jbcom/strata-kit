/**
 * Unit test setup file
 * 
 * Mocks WebGL and DOM APIs for tests that don't need real rendering
 */

// Mock WebGL context for Three.js
if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    
    if (!gl) {
        // Create a minimal WebGL mock
        const mockGL = {
            getParameter: () => 0,
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
            UNPACK_FLIP_Y_WEBGL: 37440
        };
        
        // Override getContext to return mock
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(contextType: string) {
            if (contextType === 'webgl' || contextType === 'webgl2') {
                return mockGL as any;
            }
            return originalGetContext.call(this, contextType);
        };
    }
}
