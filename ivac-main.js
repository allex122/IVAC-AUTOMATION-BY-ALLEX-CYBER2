// ivac-main.js
console.log("✅ IVAC Automation Script Loaded Successfully!");
alert("IVAC Script is working!");
// ivac-main.js (Demo Version)
// শুধু টেস্ট করার জন্য

(function() {
    console.log("✅ IVAC Automation Demo Script Loaded!");
    
    // একটা ছোট floating panel বানাই
    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        background: #222;
        color: #fff;
        font-family: Arial, sans-serif;
        border-radius: 10px;
        z-index: 99999;
        box-shadow: 0 0 15px rgba(0,0,0,0.5);
    `;
    panel.innerHTML = `
        <h3 style="margin:0 0 10px 0;">IVAC Demo</h3>
        <button id="demoBtn">Click Me!</button>
    `;
    document.body.appendChild(panel);

    document.getElementById("demoBtn").onclick = () => {
        alert("🚀 Demo Button Working!");
    };
})();
