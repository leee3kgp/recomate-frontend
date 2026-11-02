
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const movies = [
    {
        selector: ".poster-one",
        title: "인터스텔라",
        posterPath: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"
    },
    {
        selector: ".poster-two",
        title: "인사이드 아웃 2",
        posterPath: "/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg"
    },
    {
        selector: ".poster-three",
        title: "라라랜드",
        posterPath: "/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg"
    },
    {
        selector: ".poster-four",
        title: "기생충",
        posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"
    },
    {
        selector: ".poster-five",
        title: "듄",
        posterPath: "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg"
    }
];

document.addEventListener("DOMContentLoaded", () => {
    movies.forEach((movie) => {
        const posterElement = document.querySelector(movie.selector);

        if (!posterElement) return;

        const image = document.createElement("img");

        image.src = `${TMDB_IMAGE_BASE_URL}${movie.posterPath}`;
        image.alt = `${movie.title} 영화 포스터`;
        image.loading = "lazy";

        Object.assign(image.style, {
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "inherit"
        });

        image.addEventListener("error", () => {
            image.remove();
        }, { once: true });

        posterElement.replaceChildren(image);
    });
});
