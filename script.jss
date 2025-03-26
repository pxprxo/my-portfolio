

let slideIndex = 0;
        function showSlides() {
            let slides = document.querySelectorAll(".mySlides");
            let dots = document.querySelectorAll(".dot");
            slides.forEach((slide, i) => {
                slide.style.display = i === slideIndex ? "block" : "none";
            });
            dots.forEach(dot => dot.classList.remove("active"));
            dots[slideIndex].classList.add("active");
            slideIndex = (slideIndex + 1) % slides.length;
            setTimeout(showSlides, 3500);
        }
        function currentSlide(n) {
            slideIndex = n;
            showSlides();
        }
        document.addEventListener("DOMContentLoaded", () => {
            showSlides();
        });


window.onscroll = function() {
    stickyMenu();
};

const menuBar = document.querySelector('.menu-bar');
const header = document.querySelector('.header');
const headerHeight = header.offsetHeight; // Get the height of the header

function stickyMenu() {
    if (window.pageYOffset > headerHeight) {
        menuBar.classList.add("sticky"); // Add sticky class when you scroll past the header
    } else {
        menuBar.classList.remove("sticky"); // Remove sticky class when you are above the header
    }
}

function toggleMenu() {
    menuBar.classList.toggle('mobile'); // Toggle the mobile class
}

// Add event listeners to each link in the menu
const menuLinks = document.querySelectorAll('.menu-container a');
menuLinks.forEach(link => {
    link.addEventListener('click', function() {
        menuBar.classList.remove('mobile'); // Hide the menu when a link is clicked
    });
});



        
