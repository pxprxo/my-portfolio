// let slideIndex = 1;
//         showSlides(slideIndex);

//         function currentSlide(n) {
//             showSlides(slideIndex = n);
//         }

//         function showSlides(n) {
//             let i;
//             let slides = document.getElementsByClassName("mySlides");
//             let dots = document.getElementsByClassName("dot");

//             if (n >= slides.length) {slideIndex = 0}
//             if (n < 0) {slideIndex = slides.length - 1}

//             // Hide all slides
//             for (i = 0; i < slides.length; i++) {
//                 slides[i].style.display = "none";
//                 dots[i].classList.remove("active");
//             }

//             // Show current slide with fade
//             slides[slideIndex].style.display = "block";
//             dots[slideIndex].classList.add("active");
//         }

//         // Auto advance slides
//         setInterval(() => {
//             slideIndex++;
//             showSlides(slideIndex);
//         }, 4000);


window.onscroll = function() {
    const menuBar = document.querySelector('.menu-bar');
    if (window.pageYOffset > 0) {
        menuBar.classList.add('sticky');
    } else {
        menuBar.classList.remove('sticky');
    }
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

function openPopup(imgSrc) {
    const popup = document.getElementById("imagePopup");
    const popupImg = document.getElementById("popupImage");
    popup.style.display = "block";
    popupImg.src = imgSrc;
}

function closePopup() {
    document.getElementById("imagePopup").style.display = "none";
}

// Close popup when clicking outside the image
document.addEventListener('click', function(event) {
    if (event.target.className === 'popup') {
        closePopup();
    }
});





