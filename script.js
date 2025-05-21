// DOM Elements
const latexInput = document.getElementById('latex-input');
const generatePdfButton = document.getElementById('generate-pdf');
const downloadPdfButton = document.getElementById('download-pdf');
const pdfViewer = document.getElementById('pdf-viewer');
const errorMessageDiv = document.getElementById('error-message');
const loadingMessageDiv = document.getElementById('loading-message');

// API Configuration
const OPENROUTER_API_KEY = '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'meta-llama/llama-4-scout:free';

let currentPdfDocGenerator = null;
let currentPdfDataUrl = null;

// Function to display error messages
function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = 'block';
    pdfViewer.src = 'about:blank'; // Clear iframe on error
    downloadPdfButton.style.display = 'none';
    if (loadingMessageDiv) { // Check if element exists
        loadingMessageDiv.style.display = 'none'; // Hide loading message on error
    }
}

// Function to hide error messages
function clearError() {
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none';
}

// Loading indicator function
function showLoading(isLoading, message = 'Generating JSON from AI...') {
    if (generatePdfButton) { // Check if element exists
        generatePdfButton.disabled = isLoading;
    }
    if (loadingMessageDiv) { // Check if element exists
        loadingMessageDiv.textContent = message;
        loadingMessageDiv.style.display = isLoading ? 'block' : 'none';
    }
    if (generatePdfButton) { // Check if element exists
        generatePdfButton.textContent = isLoading ? 'Processing...' : 'Generate PDF';
    }

    if (isLoading) {
        if (pdfViewer) pdfViewer.src = 'about:blank'; // Clear previous PDF
        if (downloadPdfButton) downloadPdfButton.style.display = 'none'; // Hide download
        clearError(); // Clear previous errors
    }
}

// Function to fetch pdfmake JSON from OpenRouter
async function getJsonFromAPI(prompt) {
    showLoading(true, 'Fetching content from AI...');

    currentPdfDocGenerator = null;
    currentPdfDataUrl = null;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { 
                        role: 'system', 
                        content: `You are an assistant that generates pdfmake document definition JSON. Respond ONLY with the JSON object string. Do not include any explanations, markdown, or other text outside the JSON. The JSON should be directly parsable. For example, if the user asks for a simple document, you might respond with: {"content": ["Hello world"]}. Ensure complex structures like tables, lists, and columns follow pdfmake's syntax.`
                    },
                    { 
                        role: 'user', 
                        content: `Generate the pdfmake document definition JSON for the following request: ${prompt}` 
                    }
                ],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error while fetching data from API.' }));
            let detail = errorData.error?.message || response.statusText;
            if (errorData.error?.code) {
                 detail += ` (Code: ${errorData.error.code})`;
            }
            console.error('API Error:', errorData);
            throw new Error(`API request failed: ${detail}`);
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            const jsonString = data.choices[0].message.content.trim();
            console.log('Received JSON String:', jsonString);
            
            try {
                let parsedJson;
                if (jsonString.startsWith('```json') && jsonString.endsWith('```')) {
                    parsedJson = JSON.parse(jsonString.substring(7, jsonString.length - 3).trim());
                } else if (jsonString.startsWith('`') && jsonString.endsWith('`')) {
                     parsedJson = JSON.parse(jsonString.substring(1, jsonString.length - 1).trim());
                } else {
                    parsedJson = JSON.parse(jsonString);
                }
                currentPdfDocGenerator = parsedJson;
                compileJsonToPdf(currentPdfDocGenerator); 
            } catch (e) {
                console.error('Failed to parse JSON response from API:', e, "Received string was:", jsonString);
                throw new Error(`Invalid JSON format received from the API. The AI returned content that could not be parsed as valid JSON. Please try rephrasing your prompt. Raw response (check console for full details): ${jsonString.substring(0,100)}...`);
            }
        } else {
            console.error('Invalid API response structure:', data);
            throw new Error('Failed to get valid content from the API response. The response structure was not as expected.');
        }

    } catch (error) {
        console.error('Error fetching/parsing JSON:', error);
        showError(`Error: ${error.message}`);
        // Ensure loading is hidden if an error occurs before compilation starts
        if (loadingMessageDiv && loadingMessageDiv.style.display === 'block' && !currentPdfDocGenerator) {
            showLoading(false);
        }
    } 
}

// Function to compile JSON to PDF using pdfmake
function compileJsonToPdf(docDefinition) {
    if (!docDefinition) {
        showError("Cannot generate PDF: No document definition available. This might be due to an earlier error.");
        showLoading(false);
        return;
    }
    if (typeof pdfMake === 'undefined' || typeof pdfMake.vfs === 'undefined') {
        showError("Critical: PDF library (pdfmake or vfs_fonts) not loaded. Refresh page, check internet, or check console for script loading errors.");
        showLoading(false);
        return;
    }

    try {
        showLoading(true, "Compiling PDF from JSON...");
        
        const pdfDoc = pdfMake.createPdf(docDefinition); 
        
        pdfDoc.getDataUrl((dataUrl) => {
            currentPdfDataUrl = dataUrl;
            displayPdf(dataUrl);
            // showLoading(false) is called by displayPdf
        }, (error) => { 
            console.error("Error generating PDF data URL with pdfmake:", error);
            showError("Error generating PDF. The document definition might be invalid or caused an issue with pdfmake.");
            showLoading(false);
        });

    } catch (error) { 
        console.error('Error during PDF generation with pdfmake:', error);
        showError(`PDF Compilation Error: ${error.message}. Check if the generated JSON is valid for pdfmake.`);
        showLoading(false);
        currentPdfDataUrl = null;
    }
}

// Function to display PDF
function displayPdf(pdfDataUrl) {
    if (pdfViewer) { // Check if element exists
        if (pdfDataUrl) {
            pdfViewer.src = pdfDataUrl;
            if (downloadPdfButton) downloadPdfButton.style.display = 'inline-block';
            clearError(); 
        } else {
            pdfViewer.src = 'about:blank';
            if (downloadPdfButton) downloadPdfButton.style.display = 'none';
        }
    }
    showLoading(false); 
}

// Event Listeners Setup
function setupEventListeners() {
    if (generatePdfButton) {
        generatePdfButton.addEventListener('click', () => {
            const prompt = latexInput ? latexInput.value.trim() : "";
            if (!prompt) {
                showError('Please enter a prompt for PDF generation. The input cannot be empty.');
                return;
            }
            if(pdfViewer) pdfViewer.src = 'about:blank';
            if(downloadPdfButton) downloadPdfButton.style.display = 'none';
            currentPdfDataUrl = null;
            currentPdfDocGenerator = null;
            
            getJsonFromAPI(prompt);
        });
    } else {
        console.error("Generate PDF button not found.");
    }

    if (downloadPdfButton) {
        downloadPdfButton.addEventListener('click', () => {
            if (currentPdfDataUrl) {
                const link = document.createElement('a');
                link.href = currentPdfDataUrl;
                link.download = 'generated_document.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                showError("No PDF available to download. Please generate a PDF first.");
            }
        });
    } else {
        console.error("Download PDF button not found.");
    }
}

// Initial checks and setup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if all critical elements exist
    if (!latexInput || !generatePdfButton || !downloadPdfButton || !pdfViewer || !errorMessageDiv || !loadingMessageDiv) {
        console.error("One or more critical HTML elements are missing from the page. Application might not function correctly.");
        if(errorMessageDiv) showError("Error: Page elements missing. Application may not work.");
        return; // Stop further execution if page isn't right
    }
    
    if (typeof pdfMake === 'undefined' || typeof pdfMake.vfs === 'undefined') {
        console.warn("pdfmake or vfs_fonts.js might not be loaded at DOMContentLoaded. PDF generation will fail if they don't load shortly.");
        showError("Warning: PDF library (pdfmake) not yet loaded. If this persists, PDF generation will fail.");
    }

    if (latexInput) { // Check if element exists
        latexInput.placeholder = "e.g., Create a document with a title 'My Report', a heading 'Section 1', and some text: 'This is the first paragraph.'";
    }
    
    setupEventListeners(); // Setup event listeners
    console.log("script.js loaded and initialized. DOM is ready.");
});
