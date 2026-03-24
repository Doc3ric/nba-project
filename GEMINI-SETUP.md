# Gemini CLI Setup Guide

## ✅ Setup Complete!

Your Gemini CLI is now configured for the NBA Analytics project.

### Configuration Files Created

1. **`.gemini-cli-config.json`** - Main configuration file
   - API Key: Stored in `GOOGLE_API_KEY` environment variable
   - Model: gemini-2.0-flash
   - Output Tokens: 4096 (for detailed responses)

2. **`prompts/`** directory with specialized prompt templates:
   - `api-testing.md` - For debugging FastAPI endpoints
   - `code-generation.md` - For generating React/FastAPI code
   - `test-generation.md` - For creating test cases
   - `docs-generation.md` - For writing documentation

3. **`gemini-cli.ps1`** - PowerShell wrapper script for easy access

### Quick Start Guide

#### For API Testing & Debugging
```bash
gemini-cli --prompt prompts/api-testing.md
```
**Best for:**
- Testing FastAPI endpoints
- Debugging 500 errors or response issues
- Optimizing database queries
- Generating cURL test requests

#### For Code Generation
```bash
gemini-cli --prompt prompts/code-generation.md
```
**Best for:**
- Creating new React components
- Writing FastAPI endpoints
- Building analytics functions
- Implementing TailwindCSS styling

#### For Test Generation
```bash
gemini-cli --prompt prompts/test-generation.md
```
**Best for:**
- Writing pytest tests for backend
- Creating Jest/Vitest tests for components
- Testing edge cases
- Validating API responses

#### For Documentation
```bash
gemini-cli --prompt prompts/docs-generation.md
```
**Best for:**
- Writing API endpoint documentation
- Documenting React components
- Creating setup guides
- Explaining complex features

### Usage Examples

**Example 1: Debug a FastAPI endpoint**
```
Prompt: "I'm getting a 500 error from the /players/search endpoint. 
         Here's my code: [paste code]. 
         What's wrong and how do I fix it?"

System will use: prompts/api-testing.md context
```

**Example 2: Generate a new component**
```
Prompt: "Generate a React component for filtering player props 
         by stat type (Points, Rebounds, Assists). 
         Include error handling and loading states."

System will use: prompts/code-generation.md context
```

**Example 3: Create tests**
```
Prompt: "Generate pytest tests for the prop_recommendation_engine function. 
         Test various player types (guards, forwards, centers) 
         and edge cases."

System will use: prompts/test-generation.md context
```

### Project Context

The system is configured with your project details:
- **Name**: Player Props Edge - NBA Analytics Dashboard
- **Backend**: FastAPI (port 8000)
- **Frontend**: React 19 + Vite (port 5173)
- **Database**: SQLite with SQLAlchemy ORM
- **Key Features**:
  - Prop betting recommendations
  - Matchup analysis
  - Consistency scoring
  - Real-time odds tracking
  - Interactive visualizations

### Environment Variables

Your API key is stored as:
```powershell
$env:GOOGLE_API_KEY = "AIzaSyDWEuiyDNz_uCzk1asUvnx-IRd8DEQCRGY"
```

This is set globally and will persist across terminal sessions.

### Next Steps

1. **Use Gemini for API Testing**
   - Go to https://ai.google.dev/chatbox
   - Paste the content from `prompts/api-testing.md`
   - Ask it to test your endpoints

2. **Generate Code for New Features**
   - Use the code-generation prompt
   - Ask Gemini to create components or endpoints
   - Get production-ready code with proper error handling

3. **Auto-Generate Tests**
   - Use the test-generation prompt
   - Request tests for critical functions
   - Improve code coverage

4. **Create Documentation**
   - Use the docs-generation prompt
   - Generate API docs, component guides
   - Keep documentation in sync with code

### Tips

- **Copy-Paste Your Code**: When asking about specific issues, always include your actual code for accurate analysis
- **Provide Context**: Mention what error you're getting or what behavior is unexpected
- **Request Complete Solutions**: Ask Gemini to provide complete working code, not just snippets
- **Iterate**: Use follow-up questions to refine suggestions

### Troubleshooting

If you get `GOOGLE_API_KEY` errors:
```powershell
# Verify environment variable
echo $env:GOOGLE_API_KEY

# Re-set if needed
setx GOOGLE_API_KEY "AIzaSyDWEuiyDNz_uCzk1asUvnx-IRd8DEQCRGY"
```

If prompts don't load:
```powershell
# Check prompt files exist
ls prompts/
```

### Documentation Links

- Gemini Chatbox: https://ai.google.dev/chatbox
- Gemini CLI Docs: https://github.com/Google/gemini-cli
- NBA API Docs: https://github.com/swar/nba_api
- FastAPI Docs: https://fastapi.tiangolo.com
